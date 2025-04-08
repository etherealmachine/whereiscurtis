import { env } from '$env/dynamic/private';
import type { RequestEvent } from "@sveltejs/kit";
import { dropTables, initializeDatabase, storeEvents, getLastApiRequest } from '$lib/database';
import { getDb } from '$lib/database';
import type { SpotMessage } from '$lib/spot_api';
import { parseSpotMessages } from '$lib/spot_api';

export async function GET({ url }: RequestEvent): Promise<Response> {
  // Check for debug password
  if (!url.searchParams.get('password') || url.searchParams.get('password') !== env.DEBUG_PASSWORD) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (url.searchParams.get('replay')) {
    try {
      const lastRequest = await getLastApiRequest();
      if (!lastRequest) {
        return new Response('No previous API request found', { status: 404 });
      }

      const messages = parseSpotMessages(lastRequest.response);

      // Store the parsed messages
      await storeEvents(messages);
      return new Response(JSON.stringify({
        message: `Successfully replayed and stored ${messages.length} messages`,
        messages
      }), { 
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error replaying API request:', error);
      return new Response('Error replaying API request', { status: 500 });
    }
  } else if (url.searchParams.get('sql')) {
    const sql = url.searchParams.get('sql');
    if (!sql) {
      return new Response('No SQL query provided', { status: 400 });
    }
    const decodedSql = decodeURIComponent(sql);
    const db = getDb();
    const result = db.all(decodedSql);
    return new Response(JSON.stringify(result), { status: 200 });
  } else if (url.searchParams.get('reset-database')) {
    try {
      // Drop and reinitialize the database
      await dropTables();
      await initializeDatabase();
      return new Response('Database reset successful', { status: 200 });
    } catch (error) {
      console.error('Database reset failed:', error);
      return new Response('Database reset failed', { status: 500 });
    }
  }
  
  // Default response if no valid parameters are provided
  return new Response('No valid debug operation specified', { status: 400 });
}

export async function POST({ request, url }: RequestEvent): Promise<Response> {
  // Check for debug password
  if (!url.searchParams.get('password') || url.searchParams.get('password') !== env.DEBUG_PASSWORD) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const data = await request.json();
    
    // Validate the data structure
    if (!data.messages || !Array.isArray(data.messages)) {
      return new Response('Invalid data format: expected messages array', { status: 400 });
    }

    // Validate each message has required fields
    const messages: SpotMessage[] = data.messages;
    for (const message of messages) {
      if (!message.id || !message.messageType || !message.unixTime || 
          !message.latitude || !message.longitude) {
        return new Response('Invalid message format: missing required fields', { status: 400 });
      }
    }

    // Store the events in the database
    await storeEvents(messages);
    return new Response(`Successfully stored ${messages.length} events`, { status: 200 });
  } catch (error) {
    console.error('Error processing upload:', error);
    return new Response('Error processing upload', { status: 500 });
  }
}