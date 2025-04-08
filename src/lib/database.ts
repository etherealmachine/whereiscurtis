/*
At least 2.5 minutes between Spot API calls.
Feed limits data to last 7 days.

Check database for last Spot feed fetch
If it's been more than 5 minutes, do a fetch
Store the last N raw JSON request/responses in the DB
Parse the JSON and load Events into the DB

db.get(sql, (err, result) => {
  if (err) {
    reject(err);
  } else {
    resolve(result);
  }
  db.close();
});
*/
import { env } from "$env/dynamic/private";
import sqlite3 from 'sqlite3';
import type { SpotMessage } from './spot_api';

type MessageType = 'CUSTOM' | 'UNLIMITED-TRACK' | 'OK';

interface ApiRequestRow {
  id: number;
  request_json: string;
  response_json: string;
  status_code: number;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  message_type: MessageType;
  message_content: string | null;
  unix_time: number;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
}

const db = new sqlite3.Database(env.DATABASE_URL as string);

export { db };

// Create tables if they don't exist
export async function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // API requests table to store raw requests/responses
      db.run(`
        CREATE TABLE IF NOT EXISTS api_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          request_json TEXT NOT NULL,
          response_json TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Events table to store parsed Spot messages
      db.run(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          message_type TEXT NOT NULL,
          message_content TEXT,
          unix_time INTEGER NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create index on unix_time for efficient time-based queries
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_events_unix_time ON events(unix_time)
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// Drop tables (for testing/reset)
export async function dropTables(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DROP TABLE IF EXISTS api_requests');
      db.run('DROP TABLE IF EXISTS events', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// Store API request/response
export async function storeApiRequest(request: any, response: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO api_requests (request_json, response_json, status_code)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(
      JSON.stringify(request),
      JSON.stringify(response),
      request.statusCode,
      (err: Error | null) => {
        if (err) reject(err);
        else {
          // Auto-truncate old requests (keep last 100)
          db.run(`
            DELETE FROM api_requests 
            WHERE id NOT IN (
              SELECT id FROM api_requests 
              ORDER BY created_at DESC 
              LIMIT 100
            )
          `, (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        }
      }
    );
    stmt.finalize();
  });
}

// Get most recent API request time and status
export async function getLastApiRequestInfo(): Promise<{ time: number | null; status: number | null }> {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT created_at, status_code 
      FROM api_requests 
      ORDER BY created_at DESC 
      LIMIT 1
    `, (err: Error | null, row: ApiRequestRow | undefined) => {
      if (err) reject(err);
      else resolve({
        time: row ? new Date(row.created_at + 'Z').getTime() : null,
        status: row ? row.status_code : null
      });
    });
  });
}

// Store batch of events with deduplication
export async function storeEvents(events: SpotMessage[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO events 
      (id, message_type, message_content, unix_time, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      events.forEach(event => {
        stmt.run(
          event.id,
          event.messageType,
          event.messageContent,
          event.unixTime,
          event.latitude,
          event.longitude
        );
      });

      stmt.finalize();
      
      db.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// Get events with time range and limit
export async function getEvents(
  startTime?: number,
  endTime?: number,
  limit: number = 100
): Promise<SpotMessage[]> {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM events';
    const params: any[] = [];
    
    if (startTime || endTime) {
      query += ' WHERE';
      if (startTime) {
        query += ' unix_time >= ?';
        params.push(startTime);
      }
      if (startTime && endTime) {
        query += ' AND';
      }
      if (endTime) {
        query += ' unix_time <= ?';
        params.push(endTime);
      }
    }
    
    query += ' ORDER BY unix_time DESC LIMIT ?';
    params.push(limit);

    db.all(query, params, (err: Error | null, rows: EventRow[]) => {
      if (err) reject(err);
      else {
        const events = rows.map(row => ({
          id: row.id,
          messageType: row.message_type as MessageType,
          messageContent: row.message_content || '',
          unixTime: row.unix_time,
          latitude: row.latitude,
          longitude: row.longitude
        }));
        resolve(events);
      }
    });
  });
}
