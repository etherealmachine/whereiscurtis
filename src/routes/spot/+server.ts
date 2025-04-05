import { env } from "$env/dynamic/private";
import { latestSpotMessages } from "$lib/spot_api";
import sqlite3 from 'sqlite3';

async function query(sql: string): Promise<unknown> {
  const db = new sqlite3.Database(env.DATABASE_URL as string);
  return new Promise((resolve, reject) => {
    db.get(sql, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
      db.close();
    });
  });
}

export async function GET() {
  const messages = await latestSpotMessages();
  try {
    const rows = await query("SELECT 1");
    console.log(rows);
  } catch (error) {
    console.error(error);
  }
  return new Response(JSON.stringify(messages), {
    headers: {
      'Content-Type': 'application/json',
    }
  });
}