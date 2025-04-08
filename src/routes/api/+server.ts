import { getEvents, getLastApiRequestInfo, initializeDatabase, storeEvents } from "$lib/database";
import { latestSpotMessages, type SpotMessage } from "$lib/spot_api";
import type { RequestEvent } from "@sveltejs/kit";

export async function GET({ params }: RequestEvent): Promise<Response> {
  await initializeDatabase();
  const { time: lastApiRequestTime, status: lastApiResponseStatus } = await getLastApiRequestInfo();
  let messages: SpotMessage[] = [];
  let fromCache = false;
  
  if (lastApiRequestTime === null || lastApiRequestTime < Date.now() - 5 * 60 * 1000) {
    console.log('Fetching latest messages');
    messages = await latestSpotMessages();
    await storeEvents(messages);
  } else {
    messages = await getEvents();
    fromCache = true;
  }
  
  return new Response(JSON.stringify({
    messages,
    lastApiRequestTime,
    lastApiResponseStatus,
    fromCache,
  }), {
    headers: {
      'Content-Type': 'application/json',
    }
  });
}