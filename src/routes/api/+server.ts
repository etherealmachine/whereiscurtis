import { getEvents, getLastApiRequestInfo, initializeDatabase, storeEvents } from "$lib/database";
import { latestSpotMessages, type SpotMessage } from "$lib/spot_api";

export async function GET(): Promise<Response> {
  await initializeDatabase();
  let { time: lastApiRequestTime, status: lastApiResponseStatus } = await getLastApiRequestInfo();
  let messages: SpotMessage[] = [];
  let fromCache = false;
  
  if (lastApiRequestTime === null || lastApiRequestTime < Date.now() - 5 * 60 * 1000) {
    console.log('Fetching latest messages');
    messages = await latestSpotMessages();
    console.log(`Storing ${messages.length} messages`);
    await storeEvents(messages);
    ({ time: lastApiRequestTime, status: lastApiResponseStatus } = await getLastApiRequestInfo());
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