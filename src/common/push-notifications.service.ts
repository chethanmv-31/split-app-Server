import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class PushNotificationService {
    private expo: Expo;
    private readonly logger = new Logger(PushNotificationService.name);

    constructor() {
        this.expo = new Expo();
    }

    async sendNotification(pushToken: string, title: string, body: string, data?: any) {
        if (!Expo.isExpoPushToken(pushToken)) {
            this.logger.error(`Push token ${pushToken} is not a valid Expo push token`);
            return;
        }

        const messages: ExpoPushMessage[] = [{
            to: pushToken,
            sound: 'default',
            title,
            body,
            data,
        }];

        try {
            const chunks = this.expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
                this.logger.log('Push notification sent successfully');
                // You can handle tickets here if you want to track status or errors
            }
        } catch (error) {
            this.logger.error('Error sending push notification:', error);
        }
    }

    async sendToMultiple(pushTokens: string[], title: string, body: string, data?: any) {
        const validTokens = pushTokens.filter(token => Expo.isExpoPushToken(token));

        if (validTokens.length === 0) return;

        const messages: ExpoPushMessage[] = validTokens.map(token => ({
            to: token,
            sound: 'default',
            title,
            body,
            data,
        }));

        try {
            const chunks = this.expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                await this.expo.sendPushNotificationsAsync(chunk);
            }
            this.logger.log(`Push notifications sent to ${validTokens.length} users`);
        } catch (error) {
            this.logger.error('Error sending multiple push notifications:', error);
        }
    }
}
