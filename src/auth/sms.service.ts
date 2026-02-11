import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);
    private client: Twilio | null = null;
    private fromNumber: string | undefined;

    constructor(private configService: ConfigService) {
        const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
        const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
        this.fromNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER');

        if (accountSid && authToken) {
            this.client = new Twilio(accountSid, authToken);
        } else {
            this.logger.warn('Twilio credentials not found. SMS will be logged to console only.');
        }
    }

    async sendSms(to: string, body: string): Promise<boolean> {
        const formattedTo = to.startsWith('+') ? to : `+91${to}`; // Defaulting to India code if not present, adjust as needed

        if (this.client && this.fromNumber) {
            try {
                await this.client.messages.create({
                    body,
                    from: this.fromNumber,
                    to: formattedTo,
                });
                this.logger.log(`SMS sent to ${formattedTo}`);
                return true;
            } catch (error) {
                this.logger.error(`Failed to send SMS to ${formattedTo}: ${error.message}`);
                return false;
            }
        } else {
            this.logger.log(`[SIMULATED SMS] To: ${formattedTo}, Body: ${body}`);
            return true;
        }
    }
}
