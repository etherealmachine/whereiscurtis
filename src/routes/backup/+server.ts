import { latestSpotMessages } from '$lib/spot_api';
import { sendEmail } from '$lib/email';
import { getLastBackupTime, initializeDatabase, storeBackupAttempt } from '$lib/database';

const BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(): Promise<Response> {
  console.log('Starting backup');
  try {
    await initializeDatabase();
    const lastBackupTime = await getLastBackupTime();
    const now = Date.now();
    
    if (lastBackupTime && (now - lastBackupTime) < BACKUP_INTERVAL_MS) {
      return new Response(JSON.stringify({
        message: 'Backup skipped - too soon since last backup',
        lastBackupTime: new Date(lastBackupTime).toISOString()
      }), { 
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    const messages = await latestSpotMessages();
    const jsonString = JSON.stringify(messages, null, 2);
    
    await sendEmail(
      ['etherealmachine@gmail.com', 'curtiskephart@gmail.com'],
      'Spot Messages Backup',
      'Please find attached the latest backup of Spot messages.',
      '<p>Please find attached the latest backup of Spot messages.</p>',
      [{
        filename: `spot_messages_${new Date().toISOString()}.json`,
        content: jsonString
      }]
    );

    // Record successful backup
    await storeBackupAttempt();
    
    return new Response(JSON.stringify({
      message: `Successfully backed up ${messages.length} messages`,
      messages
    }), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error during backup:', error);
    // Record failed backup
    await storeBackupAttempt(error instanceof Error ? error.message : String(error));
    return new Response('Error during backup', { status: 500 });
  }
}