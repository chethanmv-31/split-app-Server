import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { randomInt } from 'crypto';
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
    private otpStore: Record<string, { otp: string; expires: number; attempts: number }> = {};
    private readonly loginAttempts = new Map<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>();
    private readonly otpSendAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

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

    private assertLoginAttemptAllowed(identifier: string): void {
        const now = Date.now();
        const record = this.loginAttempts.get(identifier);
        if (!record?.lockedUntil) {
            return;
        }

        if (record.lockedUntil > now) {
            throw new HttpException('Too many failed login attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
        }

        this.loginAttempts.delete(identifier);
    }

    private registerLoginFailure(identifier: string): void {
        const now = Date.now();
        const windowMs = 15 * 60 * 1000;
        const lockMs = 10 * 60 * 1000;
        const maxAttempts = 5;
        const existing = this.loginAttempts.get(identifier);

        if (!existing || now - existing.firstAttemptAt > windowMs) {
            this.loginAttempts.set(identifier, { count: 1, firstAttemptAt: now });
            return;
        }

        const nextCount = existing.count + 1;
        if (nextCount >= maxAttempts) {
            this.loginAttempts.set(identifier, {
                count: nextCount,
                firstAttemptAt: existing.firstAttemptAt,
                lockedUntil: now + lockMs,
            });
            return;
        }

        this.loginAttempts.set(identifier, {
            count: nextCount,
            firstAttemptAt: existing.firstAttemptAt,
        });
    }

    private clearLoginFailures(identifier: string): void {
        this.loginAttempts.delete(identifier);
    }

    private assertOtpSendAllowed(mobile: string): void {
        const now = Date.now();
        const windowMs = 10 * 60 * 1000;
        const maxRequests = 3;
        const existing = this.otpSendAttempts.get(mobile);
        if (!existing || now - existing.firstAttemptAt > windowMs) {
            this.otpSendAttempts.set(mobile, { count: 1, firstAttemptAt: now });
            return;
        }

        if (existing.count >= maxRequests) {
            throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
        }

        this.otpSendAttempts.set(mobile, {
            count: existing.count + 1,
            firstAttemptAt: existing.firstAttemptAt,
        });
    }

    async login(email: string, password: string): Promise<AuthResult> {
        const normalizedEmail = email.trim().toLowerCase();
        this.assertLoginAttemptAllowed(normalizedEmail);

        const user = await this.usersService.validateCredentials(email, password);
        if (!user) {
            this.registerLoginFailure(normalizedEmail);
            throw new UnauthorizedException('Invalid email or password');
        }

        this.clearLoginFailures(normalizedEmail);
        return this.buildAuthResult(user);
    }

    async sendOtp(mobile: string) {
        this.assertOtpSendAllowed(mobile);

        const user = await this.usersService.findOneByMobile(mobile);
        if (!user) {
            throw new UnauthorizedException('Mobile number not found');
        }

        const otp = randomInt(1000, 10000).toString();
        this.otpStore[mobile] = {
            otp,
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
            attempts: 0,
        };

        const message = `Your Split App OTP is: ${otp}. Valid for 5 minutes.`;
        const smsSent = await this.smsService.sendSms(mobile, message);
        if (!smsSent) {
            delete this.otpStore[mobile];
            throw new BadRequestException('Failed to send OTP SMS. Please verify Twilio settings and number format.');
        }

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
            record.attempts += 1;
            if (record.attempts >= 5) {
                delete this.otpStore[mobile];
                throw new BadRequestException('OTP verification attempts exceeded');
            }
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
