import { latestSpotMessages } from '$lib/spot_api';
import { sendEmail } from '$lib/email';

export async function GET(): Promise<Response> {
  try {
    const messages = await latestSpotMessages();
    const jsonString = JSON.stringify(messages, null, 2);
    
    await sendEmail(
      'etherealmachine@gmail.com',
      'Spot Messages Backup',
      'Please find attached the latest backup of Spot messages.',
      '<p>Please find attached the latest backup of Spot messages.</p>',
      [{
        filename: `spot_messages_${new Date().toISOString()}.json`,
        content: jsonString
      }]
    );
    
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
    return new Response('Error during backup', { status: 500 });
  }
}