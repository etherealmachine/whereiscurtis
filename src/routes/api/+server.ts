import { getEvents, getLastApiRequestInfo, initializeDatabase, storeEvents } from "$lib/database";
import { latestSpotMessages, type SpotMessage } from "$lib/spot_api";

export async function GET(): Promise<Response> {
  await initializeDatabase();
  let { time: lastApiRequestTime, status: lastApiResponseStatus } = await getLastApiRequestInfo();
  let messages: SpotMessage[] = [];
  let fromCache = false;
  
  if (lastApiRequestTime === null || lastApiRequestTime < Date.now() - 5 * 60 * 1000) {
    await storeEvents(await latestSpotMessages());
    ({ time: lastApiRequestTime, status: lastApiResponseStatus } = await getLastApiRequestInfo());
  } else {
    fromCache = true;
  }
  const startTime = Date.parse('05/05/2025');
  const endTime = Date.now();
  messages = await getEvents(startTime, endTime, -1);
  
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