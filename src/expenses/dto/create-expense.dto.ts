import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MOBILE_REGEX = /^\+?\d{10,15}$/;

export class SplitDetailDto {
  @IsString()
  userId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class InvitedUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(MOBILE_REGEX)
  mobile?: string;
}

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsIn(['EQUAL', 'UNEQUAL'])
  splitType!: 'EQUAL' | 'UNEQUAL';

  @IsOptional()
  @IsString()
  @MinLength(1)
  paidBy?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  splitBetween!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SplitDetailDto)
  splitDetails?: SplitDetailDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvitedUserDto)
  invitedUsers?: InvitedUserDto[];
}
