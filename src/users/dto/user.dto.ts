import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const MOBILE_REGEX = /^\+?\d{10,15}$/;

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile?: string;
}

export class InviteUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile?: string;
}

export class UpdatePushTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  pushToken!: string;
}

export class FindUsersQueryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;
}
