import { IsString, Matches } from 'class-validator';

const MOBILE_REGEX = /^\+?\d{10,15}$/;

export class SendOtpDto {
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile!: string;
}
