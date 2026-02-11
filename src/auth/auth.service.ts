import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SmsService } from './sms.service';

@Injectable()
export class AuthService {
    private otpStore: Record<string, { otp: string; expires: number }> = {};

    constructor(
        private usersService: UsersService,
        private smsService: SmsService,
    ) { }

    async sendOtp(mobile: string) {
        const user = await this.usersService.findOneByMobile(mobile);
        if (!user) {
            throw new UnauthorizedException('Mobile number not found');
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        this.otpStore[mobile] = {
            otp,
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
        };

        const message = `Your Split App OTP is: ${otp}. Valid for 5 minutes.`;
        await this.smsService.sendSms(mobile, message);

        console.log(`\n[OTP SERVICE] Generated OTP for ${mobile}: ${otp}\n`);

        // In development, we return the OTP to the frontend for easy testing.
        return { success: true, message: 'OTP sent successfully', otp };
    }

    async verifyOtp(mobile: string, otp: string) {
        const record = this.otpStore[mobile];

        if (!record) {
            throw new BadRequestException('OTP not found or expired');
        }

        if (Date.now() > record.expires) {
            delete this.otpStore[mobile];
            throw new BadRequestException('OTP expired');
        }

        if (record.otp !== otp) {
            throw new BadRequestException('Invalid OTP');
        }

        // OTP matches
        delete this.otpStore[mobile];
        const user = await this.usersService.findOneByMobile(mobile);
        return { success: true, user };
    }
}
