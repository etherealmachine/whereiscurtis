import { env } from '$env/dynamic/private';
import { storeApiRequest } from './database';

export interface SpotMessage {
    id: string;
    messageType: 'CUSTOM' | 'UNLIMITED-TRACK' | 'OK';
    messageContent: string;
    unixTime: number;
    latitude: number;
    longitude: number;
}

export function parseSpotMessages(data: any): SpotMessage[] {
    return data.response.feedMessageResponse.messages.message.map((message: any) => {
        const { 
            id,
            messageType, /* CUSTOM, UNLIMITED-TRACK, OK */
            messageContent,
            unixTime,
            latitude,
            longitude,
        } = message;
        return {
            id,
            messageType,
            messageContent,
            unixTime,
            latitude,
            longitude,
        };
    });
}

export async function latestSpotMessages(): Promise<SpotMessage[]> {
    const url = `https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/${env.SPOT_FEED_ID}/message.json`;
    const response = await fetch(url);
    const statusCode = response.status;
    
    // Store the request and response in the database
    await storeApiRequest({ 
        url,
        statusCode,
        timestamp: Date.now()
    }, await response.json());
    
    if (!response.ok) {
        throw new Error(`SPOT API request failed with status ${statusCode}`);
    }
    
    try {
        const data = await response.json();
        return parseSpotMessages(data);
    } catch (error) {
        console.error('Error parsing SPOT API response:', error);
        throw new Error('Error parsing SPOT API response');
    }
}