import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { SmsService } from './sms.service';
import { JwtTokenService } from './jwt-token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [forwardRef(() => UsersModule)],
  providers: [AuthService, SmsService, JwtTokenService, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtTokenService, JwtAuthGuard],
})
export class AuthModule { }
