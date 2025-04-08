import { getEvents, initializeDatabase } from "$lib/database";
import type { RequestEvent } from "@sveltejs/kit";

export async function GET({ params }: RequestEvent): Promise<Response> {
  await initializeDatabase();
  const messages = await getEvents();

  const date = new Date().toISOString().split('T')[0];
  const filename = `whereiscurtis_backup_${date}.json`;
  
  return new Response(JSON.stringify(messages), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}