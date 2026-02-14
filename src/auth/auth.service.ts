import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { User, UsersService } from '../users/users.service';
import { SmsService } from './sms.service';
import { JwtTokenService } from './jwt-token.service';

export interface AuthResult {
    success: true;
    accessToken: string;
    user: Omit<User, 'password' | 'passwordHash'>;
}

@Injectable()
export class AuthService {
    private otpStore: Record<string, { otp: string; expires: number }> = {};

    constructor(
        private usersService: UsersService,
        private smsService: SmsService,
        private jwtTokenService: JwtTokenService,
    ) { }

    private sanitizeUser(user: User): Omit<User, 'password' | 'passwordHash'> {
        const { password, passwordHash, ...safeUser } = user as User & { passwordHash?: string };
        return safeUser;
    }

    private buildAuthResult(user: User): AuthResult {
        const accessToken = this.jwtTokenService.sign({
            sub: user.id,
            userId: user.id,
            email: user.email,
            mobile: user.mobile,
        });
        return {
            success: true,
            accessToken,
            user: this.sanitizeUser(user),
        };
    }

    async login(email: string, password: string): Promise<AuthResult> {
        const user = await this.usersService.validateCredentials(email, password);
        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }
        return this.buildAuthResult(user);
    }

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
        const smsSent = await this.smsService.sendSms(mobile, message);
        if (!smsSent) {
            delete this.otpStore[mobile];
            throw new BadRequestException('Failed to send OTP SMS. Please verify Twilio settings and number format.');
        }

        console.log(`\n[OTP SERVICE] Generated OTP for ${mobile}\n`);
        return { success: true, message: 'OTP sent successfully' };
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

        delete this.otpStore[mobile];
        const user = await this.usersService.findOneByMobile(mobile);
        if (!user) {
            throw new UnauthorizedException('Mobile number not found');
        }
        return this.buildAuthResult(user);
    }
}
