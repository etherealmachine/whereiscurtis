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
  let showTrail = $state(localStorage.getItem('showTrail') === 'true');
  let trailData: any[] | undefined = $state(undefined);

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

  function renderMap() {
    if (!map) return;
    // Clear existing markers and polylines
    map.eachLayer((layer) => {
      if (map && (layer instanceof L.Marker || layer instanceof L.Polyline)) {
        map.removeLayer(layer);
      }
    });

    if (showTrail && trailData) {
      L.geoJSON(trailData, {
        style: {
          color: '#0078d4bb', // TODO: light blue with some opacity
        }
      }).addTo(map);
    }

    let previousMessage: SpotMessage | undefined;
    
    // Group messages by hour and find the one closest to the hour mark, only considering messages in first 30 minutes
    const messagesByHour = new Map<number, SpotMessage>();
    selectedMessages.forEach(message => {
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

    const filteredMessages = selectedMessages.filter((message, index) => {
      // Always include first and last messages
      if (index === 0 || index === messages.length - 1) return true;
      
      // Include messages with non-empty content
      if (message.messageContent) return true;
      
      // Include messages that are closest to their hour
      const date = new Date(message.unixTime * 1000);
      const hour = date.getHours();
      return messagesByHour.get(hour) === message;
    });

    for (const message of filteredMessages) {
      const { latitude, longitude, messageContent, unixTime } = message;
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

  function loadTrailData() {
    if (showTrail && trailData === undefined) {
      fetch('/pct.json')
        .then(res => res.json())
        .then(data => {
          trailData = data;
        });
    }
    localStorage.setItem('showTrail', showTrail.toString());
  }

  $effect(() => {
    renderMap();
  });

  $effect(() => {
    loadTrailData();
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

<div id="date-selector" class="flex flex-col items-center gap-1 absolute top-2 left-1/2 -translate-x-1/2 z-[100] bg-white p-2.5 rounded-lg shadow-sm min-w-max">
  <div class="flex flex-row w-full items-center justify-between relative">
    <div class="flex-1 text-center text-lg font-bold mb-2 whitespace-nowrap">{formatDate(selectedDay)}</div>
    <div class="flex flex-row items-center gap-2 absolute right-0">
      <label for="show-trail">Trail</label>
      <input type="checkbox" id="show-trail" bind:checked={showTrail} onclick={loadTrailData} />
    </div>
  </div>
  <div class="flex gap-1 flex-nowrap">
    <button 
      class="flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded bg-white cursor-pointer text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100" 
      onclick={navigateToFirstDay} 
      title="Go to first message"
      disabled={!hasMessagesBefore(selectedDay)}
    >
      <span class="text-base">⏮</span>
    </button>
    <button 
      class="flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded bg-white cursor-pointer text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100" 
      onclick={navigateToPreviousDay} 
      title="Previous day"
      disabled={!hasMessagesBefore(selectedDay)}
    >
      <span class="text-base">←</span>
      <span class="whitespace-nowrap">{formatDay(getPreviousDay(selectedDay))}</span>
    </button>
    <button
      class="flex items-center justify-center gap-1 px-3 py-2 border border-[#0078d4] rounded bg-[#0078d4] text-white cursor-pointer text-sm whitespace-nowrap hover:bg-[#006cbd]"
      title="Current day"
      onclick={() => updateSelectedDay(selectedDay)}
    >
      <span class="whitespace-nowrap">{formatDay(selectedDay)}</span>
    </button>
    <button 
      class="flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded bg-white cursor-pointer text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100" 
      onclick={navigateToNextDay} 
      title="Next day"
      disabled={getNextDay(selectedDay) >= new Date()}
    >
      <span class="whitespace-nowrap">{formatDay(getNextDay(selectedDay))}</span>
      <span class="text-base">→</span>
    </button>
    <button 
      class="flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded bg-white cursor-pointer text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100" 
      onclick={navigateToToday} 
      title="Go to today"
      disabled={getNextDay(selectedDay) >= new Date()}
    >
      <span class="text-base">⏭</span>
    </button>
  </div>
  <div class="flex justify-around gap-4 mx-4 mt-2 pt-2 border-t border-gray-200">
    {#if tripMetrics}
      <div class="flex flex-col items-center gap-0.5">
        <span class="text-xs text-gray-600 font-bold">Start</span>
        <span class="font-bold text-gray-800">{formatUnitTime(tripMetrics.startTime)}</span>
      </div>
      <div class="flex flex-col items-center gap-0.5">
        <span class="text-xs text-gray-600 font-bold">End</span>
        <span class="font-bold text-gray-800">{formatUnitTime(tripMetrics.endTime)}</span>
      </div>
      <div class="flex flex-col items-center gap-0.5">
        <span class="text-xs text-gray-600 font-bold">Duration</span>
        <span class="font-bold text-gray-800">{formatDuration(tripMetrics.durationSeconds)}</span>
      </div>
      <div class="flex flex-col items-center gap-0.5">
        <span class="text-xs text-gray-600 font-bold">Distance</span>
        <span class="font-bold text-gray-800">{tripMetrics.totalDistance.toFixed(1)} mi</span>
      </div>
      <div class="flex flex-col items-center gap-0.5">
        <span class="text-xs text-gray-600 font-bold">Speed</span>
        <span class="font-bold text-gray-800">{tripMetrics.mph.toFixed(1)} mph</span>
      </div>
    {/if}
  </div>
</div>

<div id="status" class="absolute top-2 right-2 z-[100]">
  <button 
    class="relative cursor-pointer" 
    class:show-debug={showDebugWindow} 
    onclick={() => showDebugWindow = !showDebugWindow}
    aria-label="Toggle debug information"
    aria-expanded={showDebugWindow}
  >
    <div class="w-4 h-4 rounded-full border-2 border-white shadow-sm" class:green={getStatusColor() === 'green'} class:yellow={getStatusColor() === 'yellow'} class:red={getStatusColor() === 'red'}></div>
    {#if showDebugWindow}
      <div class="absolute top-6 right-0 bg-white p-3 rounded-lg shadow-md min-w-[200px]">
        <div class="flex justify-between mb-2">
          <span class="font-bold mr-2">Messages:</span>
          <span class="text-gray-600">{messages.length}</span>
        </div>
        <div class="flex justify-between mb-2">
          <span class="font-bold mr-2">Last API Request:</span>
          <span class="text-gray-600">{formatTimeAgo(lastApiRequestTime)}</span>
        </div>
        <div class="flex justify-between mb-2">
          <span class="font-bold mr-2">Last API Status:</span>
          <span class="text-gray-600">{lastApiResponseStatus || 'Unknown'}</span>
        </div>
        <div class="flex justify-between">
          <span class="font-bold mr-2">From Cache:</span>
          <span class="text-gray-600">{fromCache ? 'Yes' : 'No'}</span>
        </div>
      </div>
    {/if}
  </button>
</div>

<div id="map" class="flex-1 w-screen h-screen z-0"></div>

<style>
  :global(body) {
    display: flex;
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    font-size: 14px;
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

  :global(.transparent-marker) {
    display: none;
  }
  
  .green {
    background-color: #4CAF50;
  }

  .yellow {
    background-color: #FFC107;
  }

  .red {
    background-color: #F44336;
  }
</style>
