import { getEvents, getLastApiRequestTime, initializeDatabase, storeEvents } from "$lib/database";
import { latestSpotMessages, type SpotMessage } from "$lib/spot_api";
import type { RequestEvent } from "@sveltejs/kit";

export async function GET({ params }: RequestEvent): Promise<Response> {
  await initializeDatabase();
  const lastApiRequestTime = await getLastApiRequestTime();
  let messages: SpotMessage[] = [];
  let fromCache = false;
  if (lastApiRequestTime === null || lastApiRequestTime < Date.now() - 5 * 60 * 1000) {
    messages = await latestSpotMessages();
    await storeEvents(messages);
  } else {
    messages = await getEvents();
    fromCache = true;
  }

  const date = new Date().toISOString().split('T')[0];
  const filename = `whereiscurtis_backup_${date}.json`;
  
  return new Response(JSON.stringify({
    messages,
    lastApiRequestTime,
    fromCache,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}