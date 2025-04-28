import { latestSpotMessages } from '$lib/spot_api';
import { sendEmail } from '$lib/email';
import { getLastBackupTime, initializeDatabase, storeBackupAttempt } from '$lib/database';

function isWithinBackupWindow(): boolean {
  // Get current time in Pacific Time
  const now = new Date();
  const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  
  // Check if it's between 10 AM and 12 PM Pacific Time
  const hour = pacificTime.getHours();
  return hour >= 10 && hour < 12;
}

export async function GET(): Promise<Response> {
  console.log('Starting backup');
  try {
    await initializeDatabase();
    const lastBackupTime = await getLastBackupTime();
    const now = new Date();
    
    // Convert last backup time to Pacific Time for comparison
    const lastBackupDate = lastBackupTime ? new Date(lastBackupTime) : null;
    const lastBackupPacific = lastBackupDate ? new Date(lastBackupDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })) : null;
    
    // Check if we've already backed up today
    if (lastBackupPacific && 
        lastBackupPacific.getDate() === now.getDate() && 
        lastBackupPacific.getMonth() === now.getMonth() && 
        lastBackupPacific.getFullYear() === now.getFullYear()) {
      return new Response(JSON.stringify({
        message: 'Backup skipped - already backed up today',
        lastBackupTime: lastBackupDate?.toISOString()
      }), { 
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // Check if we're within the backup window
    if (!isWithinBackupWindow()) {
      return new Response(JSON.stringify({
        message: 'Backup skipped - outside backup window (10-12 AM Pacific Time)',
        currentTime: now.toISOString()
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