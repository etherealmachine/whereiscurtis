<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { defaultMarker } from '$lib/icons';
  import type { SpotMessage } from '$lib/spot_api';

  let map: L.Map;

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

    const response = await fetch('/spot');
    const messages = await response.json() as SpotMessage[];
    console.log(messages);
    messages.sort((a, b) => a.unixTime - b.unixTime);
    let previousMessage: SpotMessage | undefined;
    for (const message of messages) {
      const { latitude, longitude, messageContent, messageType } = message;
      if (messageType === 'CUSTOM') {
        const marker = L.marker([latitude, longitude]);
        marker.bindTooltip(messageContent, {
          permanent: true,
          direction: 'top',
          offset: [-15, 0],
          className: 'marker-label',
        });
        marker.addTo(map);
      }
      if (previousMessage) {
        L.polyline([[previousMessage.latitude, previousMessage.longitude], [latitude, longitude]]).addTo(map);
      }
      previousMessage = message;
    }
    if (previousMessage) {
      map.panTo([previousMessage.latitude, previousMessage.longitude]);
    }
  });
</script>

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
  }
</style>
