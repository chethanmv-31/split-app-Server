import { IsString, Matches } from 'class-validator';

const MOBILE_REGEX = /^\+?\d{10,15}$/;

export class VerifyOtpDto {
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile!: string;

  @IsString()
  @Matches(/^\d{4}$/)
  otp!: string;
}
