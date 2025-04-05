import { latestSpotMessages } from "$lib/spot_api";

export async function GET() {
  const messages = await latestSpotMessages();
  return new Response(JSON.stringify(messages), {
    headers: {
      'Content-Type': 'application/json',
    }
  });
}