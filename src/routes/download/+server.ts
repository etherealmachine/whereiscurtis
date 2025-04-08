import { env } from "$env/dynamic/private";
import { getEvents, initializeDatabase, getDb } from "$lib/database";
import type { RequestEvent } from "@sveltejs/kit";
import { readFileSync } from 'fs';

export async function GET({ url }: RequestEvent): Promise<Response> {
  const date = new Date().toISOString().split('T')[0];
  const fileprefix= `whereiscurtis_backup_${date}`;
  
  if (url.searchParams.get('raw')) {
    try {
      const dbPath = env.DATABASE_URL as string;
      const file = readFileSync(dbPath);
      return new Response(file, {
        headers: {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': `attachment; filename="${fileprefix}.sqlite3"`
        }
      });
    } catch (error) {
      console.error('Error reading database file:', error);
      return new Response('Error reading database file', { status: 500 });
    }
  }

  await initializeDatabase();
  const messages = await getEvents();
  return new Response(JSON.stringify(messages), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${fileprefix}.json"`
    }
  });
}