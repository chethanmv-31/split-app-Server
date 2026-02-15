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
    private authState = this.typeSafeAuthState();

    private typeSafeAuthState() {
        return {
            loginAttempts: {} as Record<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>,
            otpSendAttempts: {} as Record<string, { count: number; firstAttemptAt: number }>,
            otpStore: {} as Record<string, { otp: string; expires: number; attempts: number }>,
        };
    }

    constructor(
        private usersService: UsersService,
        private smsService: SmsService,
        private jwtTokenService: JwtTokenService,
    ) { }

    private async updateAuthState<T>(mutator: (authState: {
        loginAttempts: Record<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>;
        otpSendAttempts: Record<string, { count: number; firstAttemptAt: number }>;
        otpStore: Record<string, { otp: string; expires: number; attempts: number }>;
    }) => T | Promise<T>): Promise<T> {
        if (!this.authState || typeof this.authState !== 'object') {
            this.authState = this.typeSafeAuthState();
        }
        if (!this.authState.loginAttempts || typeof this.authState.loginAttempts !== 'object') {
            this.authState.loginAttempts = {};
        }
        if (!this.authState.otpSendAttempts || typeof this.authState.otpSendAttempts !== 'object') {
            this.authState.otpSendAttempts = {};
        }
        if (!this.authState.otpStore || typeof this.authState.otpStore !== 'object') {
            this.authState.otpStore = {};
        }
        return mutator(this.authState);
    }

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

    private async assertLoginAttemptAllowed(identifier: string): Promise<void> {
        const now = Date.now();
        await this.updateAuthState((authState) => {
            const record = authState.loginAttempts[identifier];
            if (!record?.lockedUntil) {
                return;
            }

            if (record.lockedUntil > now) {
                throw new HttpException('Too many failed login attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
            }

            delete authState.loginAttempts[identifier];
        });
    }

    private async registerLoginFailure(identifier: string): Promise<void> {
        const now = Date.now();
        const windowMs = 15 * 60 * 1000;
        const lockMs = 10 * 60 * 1000;
        const maxAttempts = 5;

        await this.updateAuthState((authState) => {
            const existing = authState.loginAttempts[identifier];

            if (!existing || now - existing.firstAttemptAt > windowMs) {
                authState.loginAttempts[identifier] = { count: 1, firstAttemptAt: now };
                return;
            }

            const nextCount = existing.count + 1;
            if (nextCount >= maxAttempts) {
                authState.loginAttempts[identifier] = {
                    count: nextCount,
                    firstAttemptAt: existing.firstAttemptAt,
                    lockedUntil: now + lockMs,
                };
                return;
            }

            authState.loginAttempts[identifier] = {
                count: nextCount,
                firstAttemptAt: existing.firstAttemptAt,
            };
        });
    }

    private async clearLoginFailures(identifier: string): Promise<void> {
        await this.updateAuthState((authState) => {
            delete authState.loginAttempts[identifier];
        });
    }

    private async assertOtpSendAllowed(mobile: string): Promise<void> {
        const now = Date.now();
        const windowMs = 10 * 60 * 1000;
        const maxRequests = 3;

        await this.updateAuthState((authState) => {
            const existing = authState.otpSendAttempts[mobile];
            if (!existing || now - existing.firstAttemptAt > windowMs) {
                authState.otpSendAttempts[mobile] = { count: 1, firstAttemptAt: now };
                return;
            }

            if (existing.count >= maxRequests) {
                throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
            }

            authState.otpSendAttempts[mobile] = {
                count: existing.count + 1,
                firstAttemptAt: existing.firstAttemptAt,
            };
        });
    }

    async login(email: string, password: string): Promise<AuthResult> {
        const normalizedEmail = email.trim().toLowerCase();
        await this.assertLoginAttemptAllowed(normalizedEmail);

        const user = await this.usersService.validateCredentials(email, password);
        if (!user) {
            await this.registerLoginFailure(normalizedEmail);
            throw new UnauthorizedException('Invalid email or password');
        }

        await this.clearLoginFailures(normalizedEmail);
        return this.buildAuthResult(user);
    }

    async sendOtp(mobile: string) {
        await this.assertOtpSendAllowed(mobile);

        const user = await this.usersService.findOneByMobile(mobile);
        if (!user) {
            throw new UnauthorizedException('Mobile number not found');
        }

        const otp = randomInt(1000, 10000).toString();
        await this.updateAuthState((authState) => {
            authState.otpStore[mobile] = {
                otp,
                expires: Date.now() + 5 * 60 * 1000, // 5 minutes
                attempts: 0,
            };
        });

        const message = `Your Split App OTP is: ${otp}. Valid for 5 minutes.`;
        const smsSent = await this.smsService.sendSms(mobile, message);
        if (!smsSent) {
            await this.updateAuthState((authState) => {
                delete authState.otpStore[mobile];
            });
            throw new BadRequestException('Failed to send OTP SMS. Please verify Twilio settings and number format.');
        }

        return { success: true, message: 'OTP sent successfully' };
    }

    async verifyOtp(mobile: string, otp: string) {
        const result = await this.updateAuthState((authState) => {
            const record = authState.otpStore[mobile];
            if (!record) {
                return { ok: false as const, reason: 'missing' as const };
            }

            if (Date.now() > record.expires) {
                delete authState.otpStore[mobile];
                return { ok: false as const, reason: 'expired' as const };
            }

            if (record.otp !== otp) {
                record.attempts += 1;
                if (record.attempts >= 5) {
                    delete authState.otpStore[mobile];
                    return { ok: false as const, reason: 'attempts_exceeded' as const };
                }
                return { ok: false as const, reason: 'invalid' as const };
            }

            delete authState.otpStore[mobile];
            return { ok: true as const };
        });

        if (!result.ok && result.reason === 'missing') {
            throw new BadRequestException('OTP not found or expired');
        }
        if (!result.ok && result.reason === 'expired') {
            throw new BadRequestException('OTP expired');
        }
        if (!result.ok && result.reason === 'attempts_exceeded') {
            throw new BadRequestException('OTP verification attempts exceeded');
        }
        if (!result.ok) {
            throw new BadRequestException('Invalid OTP');
        }
        const user = await this.usersService.findOneByMobile(mobile);
        if (!user) {
            throw new UnauthorizedException('Mobile number not found');
        }
        return this.buildAuthResult(user);
    }
}
