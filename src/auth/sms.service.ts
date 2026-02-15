import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);
    private client: Twilio | null = null;
    private fromNumber: string | undefined;
    private readonly defaultCountryCode: string;

    constructor(private configService: ConfigService) {
        const accountSid = this.getEnvValue('TWILIO_ACCOUNT_SID');
        const authToken = this.getEnvValue('TWILIO_AUTH_TOKEN');
        this.fromNumber = this.getEnvValue('TWILIO_PHONE_NUMBER');
        this.defaultCountryCode = this.normalizeCountryCode(
            this.getEnvValue('TWILIO_DEFAULT_COUNTRY_CODE') ?? '+1',
        );

        if (accountSid && authToken && this.fromNumber) {
            this.client = new Twilio(accountSid, authToken);
        } else {
            this.logger.warn(
                'Twilio is not fully configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER.',
            );
        }
    }

    private getEnvValue(key: string): string | undefined {
        const rawValue = this.configService.get<string>(key);
        if (!rawValue) {
            return undefined;
        }
        return rawValue.trim().replace(/^['"]|['"]$/g, '').trim();
    }

    private normalizeCountryCode(countryCode: string): string {
        const digits = countryCode.replace(/\D/g, '');
        return `+${digits || '1'}`;
    }

    private formatToNumber(to: string): string {
        const cleaned = to.trim().replace(/[^\d+]/g, '');
        if (cleaned.startsWith('+')) {
            return `+${cleaned.slice(1).replace(/\D/g, '')}`;
        }
        const digits = cleaned.replace(/\D/g, '');
        return `${this.defaultCountryCode}${digits}`;
    }

    async sendSms(to: string, body: string): Promise<boolean> {
        const formattedTo = this.formatToNumber(to);

        if (!this.client || !this.fromNumber) {
            this.logger.error(
                `SMS not sent. Twilio client unavailable or phone number missing. Destination: ${formattedTo}`,
            );
            return false;
        }

        try {
            await this.client.messages.create({
                body,
                from: this.fromNumber,
                to: formattedTo,
            });
            this.logger.log(`SMS sent to ${formattedTo}`);
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to send SMS to ${formattedTo}: ${message}`);
            return false;
        }
    }
}
