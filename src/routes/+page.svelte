<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { defaultMarker } from '$lib/icons';
  import type { SpotMessage } from '$lib/spot_api';

  let map: L.Map | undefined = $state();
  let messages: SpotMessage[] = $state([]);
  let messageGroups: SpotMessage[][] = $state([]);
  let selectedDay: Date = $state(new Date());
  let selectedMessages = $derived(messageGroups.find(group => {
    if (group.length === 0) return false;
    const groupDate = new Date(group[0].unixTime * 1000);
    return isSameDay(groupDate, selectedDay);
  }) || []);
  let tripMetrics = $derived(selectedMessages.length >= 2 ? calculateTripMetrics(selectedMessages) : null);
  let showDebugWindow = $state(false);
  let lastApiRequestTime: number | null = $state(null);
  let lastApiResponseStatus: number | null = $state(null);
  let fromCache = $state(false);

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function formatDay(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  }

  function isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  function splitMessages(messages: SpotMessage[]): SpotMessage[][] {
    if (messages.length <= 1) return [messages];
    
    const result: SpotMessage[][] = [];
    let currentGroup: SpotMessage[] = [messages[0]];
    
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i-1];
      const curr = messages[i];
      
      const prevDate = new Date(prev.unixTime * 1000);
      const currDate = new Date(curr.unixTime * 1000);
      if (!isSameDay(prevDate, currDate)) {
        result.push(currentGroup);
        currentGroup = [curr];
      } else {
        currentGroup.push(curr);
      }
    }
    
    if (currentGroup.length > 0) {
      result.push(currentGroup);
    }
    
    return result;
  }

  function formatUnitTime(unixTime: number): string {
    const date = new Date(unixTime * 1000);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function addMessagesToMap(messages: SpotMessage[]) {
    if (!map) return;
    // Clear existing markers and polylines
    map.eachLayer((layer) => {
      if (map && (layer instanceof L.Marker || layer instanceof L.Polyline)) {
        map.removeLayer(layer);
      }
    });

    let previousMessage: SpotMessage | undefined;
    
    // Group messages by hour and find the one closest to the hour mark, only considering messages in first 30 minutes
    const messagesByHour = new Map<number, SpotMessage>();
    messages.forEach(message => {
      const date = new Date(message.unixTime * 1000);
      const hour = date.getHours();
      const minutes = date.getMinutes();
      
      // Only consider messages in the first 30 minutes of the hour
      if (minutes >= 30) return;
      
      const existingMessage = messagesByHour.get(hour);
      if (!existingMessage) {
        messagesByHour.set(hour, message);
      } else {
        const existingDate = new Date(existingMessage.unixTime * 1000);
        const existingMinutes = existingDate.getMinutes();
        
        if (minutes < existingMinutes) {
          messagesByHour.set(hour, message);
        }
      }
    });

    const filteredMessages = messages.filter((message, index) => {
      // Always include first and last messages
      if (index === 0 || index === messages.length - 1) return true;
      
      // Include messages with non-empty content
      if (message.messageContent) return true;
      
      // Include messages that are closest to their hour
      const date = new Date(message.unixTime * 1000);
      const hour = date.getHours();
      return messagesByHour.get(hour) === message;
    });

    for (const [i, message] of filteredMessages.entries()) {
      const { latitude, longitude, messageContent, messageType, unixTime } = message;
      const marker = L.marker([latitude, longitude]);
      const formattedDate = formatUnitTime(unixTime);
      const tooltip = marker.bindTooltip(`${formattedDate}${messageContent ? ': ' + messageContent : ''}`, {
        permanent: true,
        interactive: true,
        direction: 'top',
        offset: [-15, 0],
        className: 'marker-label',
      });
      marker.addTo(map);
      if (previousMessage) {
        L.polyline([[previousMessage.latitude, previousMessage.longitude], [latitude, longitude]]).addTo(map);
      }
      tooltip.on('click', () => {
        if (!map) return;
        map.flyTo([latitude, longitude], map.getZoom());
      });
      marker.on('click', () => {
        if (!map) return;
        map.flyTo([latitude, longitude], map.getZoom());
      });
      previousMessage = message;
    }
    if (previousMessage) {
      map.panTo([previousMessage.latitude, previousMessage.longitude]);
    }
  }

  function updateSelectedDay(newDate: Date) {
    if (isSameDay(selectedDay, newDate)) {
      fitBoundsToMessages(selectedMessages);
      return;
    }
    selectedDay = newDate;
  }

  function getFirstMessageDate(): Date | null {
    if (messageGroups.length === 0) return null;
    const firstGroup = messageGroups[0];
    if (firstGroup.length === 0) return null;
    return new Date(firstGroup[0].unixTime * 1000);
  }

  function getPreviousDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setDate(date.getDate() - 1);
    return newDate;
  }

  function getNextDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setDate(date.getDate() + 1);
    return newDate;
  }

  function navigateToFirstDay() {
    const firstDate = getFirstMessageDate();
    if (firstDate) {
      updateSelectedDay(firstDate);
    }
  }

  function navigateToPreviousDay() {
    updateSelectedDay(getPreviousDay(selectedDay));
  }

  function navigateToNextDay() {
    updateSelectedDay(getNextDay(selectedDay));
  }

  function navigateToToday() {
    updateSelectedDay(new Date());
  }

  function hasMessagesBefore(date: Date): boolean {
    if (messageGroups.length === 0) return false;
    const firstGroup = messageGroups[0];
    if (firstGroup.length === 0) return false;
    const firstDate = new Date(firstGroup[0].unixTime * 1000);
    return firstDate < date;
  }

  function fitBoundsToMessages(messages: SpotMessage[]) {
    if (!map || messages.length === 0) return;
    
    const bounds = L.latLngBounds(messages.map(msg => [msg.latitude, msg.longitude]));
    map.fitBounds(bounds, {
      padding: [50, 50],
    });
  }

  function getStatusColor(): string {
    if (lastApiResponseStatus !== 200) return 'red';
    if (!lastApiRequestTime) return 'yellow';
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastApiRequestTime > fiveMinutesAgo ? 'green' : 'yellow';
  }

  function formatTimeAgo(timestamp: number | null): string {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function calculateTripMetrics(messages: SpotMessage[]) {
    if (messages.length < 2) return null;

    const startTime = messages[0].unixTime;
    const endTime = messages[messages.length - 1].unixTime;
    const durationSeconds = endTime - startTime;
    
    let totalDistance = 0;
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      // Calculate distance using Haversine formula
      const R = 3959; // Earth's radius in miles
      const lat1 = prev.latitude * Math.PI / 180;
      const lat2 = curr.latitude * Math.PI / 180;
      const dLat = (curr.latitude - prev.latitude) * Math.PI / 180;
      const dLon = (curr.longitude - prev.longitude) * Math.PI / 180;
      
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      totalDistance += distance;
    }

    const durationHours = durationSeconds / 3600;
    const mph = durationHours > 0 ? totalDistance / durationHours : 0;

    return {
      startTime,
      endTime,
      durationSeconds,
      totalDistance,
      mph
    };
  }

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  $effect(() => {
    if (selectedMessages.length > 0) {
      fitBoundsToMessages(selectedMessages);
    }
    addMessagesToMap(selectedMessages);
  });

  onMount(async () => {
    L.Marker.prototype.options.icon = defaultMarker;

    map = L.map('map', {
      minZoom: 0,
      maxZoom: 19,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    map.setView([37.7749, -122.4194], 13);

    const response = await fetch('/api');
    const { messages: fetchedMessages, lastApiRequestTime: requestTime, lastApiResponseStatus: responseStatus, fromCache: isFromCache } = await response.json() as { 
      messages: SpotMessage[], 
      lastApiRequestTime: number | null,
      lastApiResponseStatus: number | null,
      fromCache: boolean 
    };
    
    messages = fetchedMessages;
    lastApiRequestTime = requestTime;
    lastApiResponseStatus = responseStatus;
    fromCache = isFromCache;
    
    messages.sort((a, b) => a.unixTime - b.unixTime);
    messageGroups = splitMessages(messages);
    
    // Set initial selected day to the most recent day with messages
    if (messageGroups.length > 0) {
      const lastGroup = messageGroups[messageGroups.length - 1];
      if (lastGroup.length > 0) {
        selectedDay = new Date(lastGroup[0].unixTime * 1000);
        updateSelectedDay(selectedDay);
      }
    }
  });
</script>

<div id="date-selector">
  <div class="month">{formatDate(selectedDay)}</div>
  <div class="days">
    <button 
      class="nav-button" 
      onclick={navigateToFirstDay} 
      title="Go to first message"
      disabled={!hasMessagesBefore(selectedDay)}
    >
      <span class="icon">⏮</span>
    </button>
    <button 
      class="nav-button" 
      onclick={navigateToPreviousDay} 
      title="Previous day"
      disabled={!hasMessagesBefore(selectedDay)}
    >
      <span class="icon">←</span>
      <span class="date">{formatDay(getPreviousDay(selectedDay))}</span>
    </button>
    <button
      class="nav-button selected"
      title="Current day"
      onclick={() => updateSelectedDay(selectedDay)}
    >
      <span class="date">{formatDay(selectedDay)}</span>
    </button>
    <button 
      class="nav-button" 
      onclick={navigateToNextDay} 
      title="Next day"
      disabled={getNextDay(selectedDay) >= new Date()}
    >
      <span class="date">{formatDay(getNextDay(selectedDay))}</span>
      <span class="icon">→</span>
    </button>
    <button 
      class="nav-button" 
      onclick={navigateToToday} 
      title="Go to today"
      disabled={getNextDay(selectedDay) >= new Date()}
    >
      <span class="icon">⏭</span>
    </button>
  </div>
  <div class="trip-metrics">
    {#if tripMetrics}
      <div class="metric">
        <span class="label">Start</span>
        <span class="value">{formatUnitTime(tripMetrics.startTime)}</span>
      </div>
      <div class="metric">
        <span class="label">End</span>
        <span class="value">{formatUnitTime(tripMetrics.endTime)}</span>
      </div>
      <div class="metric">
        <span class="label">Duration</span>
        <span class="value">{formatDuration(tripMetrics.durationSeconds)}</span>
      </div>
      <div class="metric">
        <span class="label">Distance</span>
        <span class="value">{tripMetrics.totalDistance.toFixed(1)} mi</span>
      </div>
      <div class="metric">
        <span class="label">Avg Speed</span>
        <span class="value">{tripMetrics.mph.toFixed(1)} mph</span>
      </div>
    {/if}
  </div>
</div>

<div id="status">
  <button 
    class="status-indicator" 
    class:show-debug={showDebugWindow} 
    onclick={() => showDebugWindow = !showDebugWindow}
    aria-label="Toggle debug information"
    aria-expanded={showDebugWindow}
  >
    <div class="status-circle" class:green={getStatusColor() === 'green'} class:yellow={getStatusColor() === 'yellow'} class:red={getStatusColor() === 'red'}></div>
    {#if showDebugWindow}
      <div class="debug-window">
        <div class="debug-row">
          <span class="label">Messages:</span>
          <span class="value">{messages.length}</span>
        </div>
        <div class="debug-row">
          <span class="label">Last API Request:</span>
          <span class="value">{formatTimeAgo(lastApiRequestTime)}</span>
        </div>
        <div class="debug-row">
          <span class="label">Last API Status:</span>
          <span class="value">{lastApiResponseStatus || 'Unknown'}</span>
        </div>
        <div class="debug-row">
          <span class="label">From Cache:</span>
          <span class="value">{fromCache ? 'Yes' : 'No'}</span>
        </div>
      </div>
    {/if}
  </button>
</div>

<div id="map"></div>

<style>
  :global(body) {
    display: flex;
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    font-size: 14px;
  }

  #status {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 100;
  }
  
  #date-selector {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    background: white;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .month {
    text-align: center;
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 8px;
  }

  .days {
    display: flex;
    gap: 4px;
  }

  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-size: 14px;
    min-width: 80px;
  }

  .nav-button.selected {
    background: #0078d4;
    color: white;
    border-color: #0078d4;
  }

  .nav-button:hover {
    background: #f0f0f0;
  }

  .nav-button.selected:hover {
    background: #006cbd;
  }

  .icon {
    font-size: 16px;
  }

  .date {
    white-space: nowrap;
  }

  #map {
    flex: 1;
    width: 100vw;
    height: 100vh;
    z-index: 0;
  }

  :global(.marker-label) {
    background: white;
    border: none;
    box-shadow: none;
    font-weight: bold;
    color: black;
    padding: 4px 8px;
    z-index: 2;
  }

  :global(.marker-no-icon) {
    background: white;
    border: none;
    box-shadow: none;
    font-weight: bold;
    color: black;
    z-index: 1;
  }

  :global(.marker-no-icon::before) {
    display: none;
  }

  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .nav-button:disabled:hover {
    background: white;
  }

  :global(.transparent-marker) {
    display: none;
  }

  .status-indicator {
    position: relative;
    cursor: pointer;
  }

  .status-circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 0 4px rgba(0,0,0,0.2);
  }

  .status-circle.green {
    background-color: #4CAF50;
  }

  .status-circle.yellow {
    background-color: #FFC107;
  }

  .status-circle.red {
    background-color: #F44336;
  }

  .debug-window {
    position: absolute;
    top: 24px;
    right: 0;
    background: white;
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    min-width: 200px;
  }

  .debug-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .debug-row:last-child {
    margin-bottom: 0;
  }

  .label {
    font-weight: bold;
    margin-right: 8px;
  }

  .value {
    color: #666;
  }

  .trip-metrics {
    display: flex;
    justify-content: space-evenly;
    gap: 16px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #eee;
  }

  .metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .metric .label {
    font-size: 12px;
    color: #666;
  }

  .metric .value {
    font-weight: bold;
    color: #333;
  }
</style>
