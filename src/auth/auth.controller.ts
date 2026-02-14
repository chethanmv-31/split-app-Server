import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    private assertEmailPassword(email?: string, password?: string): void {
        if (!email || !password) {
            throw new BadRequestException('Email and password are required');
        }
        if (!/\S+@\S+\.\S+/.test(email)) {
            throw new BadRequestException('Invalid email format');
        }
        if (password.length < 6) {
            throw new BadRequestException('Password must be at least 6 characters');
        }
    }

    private assertMobile(mobile?: string): void {
        if (!mobile || !/^\+?\d{10,15}$/.test(mobile)) {
            throw new BadRequestException('Invalid mobile number format');
        }
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: LoginDto) {
        this.assertEmailPassword(body?.email, body?.password);
        return this.authService.login(body.email, body.password);
    }

    @Post('send-otp')
    @HttpCode(HttpStatus.OK)
    async sendOtp(@Body() body: SendOtpDto) {
        this.assertMobile(body?.mobile);
        return this.authService.sendOtp(body.mobile);
    }

    @Post('verify-otp')
    @HttpCode(HttpStatus.OK)
    async verifyOtp(@Body() body: VerifyOtpDto) {
        this.assertMobile(body?.mobile);
        if (!body?.otp || !/^\d{4}$/.test(body.otp)) {
            throw new BadRequestException('OTP must be a 4-digit code');
        }
        return this.authService.verifyOtp(body.mobile, body.otp);
    }
}
