import { env } from '$env/dynamic/private';

export interface SpotMessage {
    id: string;
    messageType: 'CUSTOM' | 'UNLIMITED-TRACK' | 'OK';
    messageContent: string;
    unixTime: number;
    latitude: number;
    longitude: number;
}

export async function latestSpotMessages(): Promise<SpotMessage[]> {
    const url = `https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/${env.SPOT_FEED_ID}/message.json`;
    const response = await fetch(url);
    const data = await response.json();
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
};