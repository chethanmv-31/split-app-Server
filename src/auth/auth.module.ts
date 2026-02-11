import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { SmsService } from './sms.service';

@Module({
  imports: [UsersModule],
  providers: [AuthService, SmsService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule { }
