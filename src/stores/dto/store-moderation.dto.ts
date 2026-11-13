import { StoreStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PageDto } from '../../common/dto/page.dto';

export class StoreModerationDto {
  @IsEnum(StoreStatus)
  expectedStatus: StoreStatus;

  @IsEnum(StoreStatus)
  status: StoreStatus;

  @IsString() @Matches(/\S/) @MaxLength(500)
  reason: string;
}

export class StoreModerationPageDto extends PageDto {
  @IsOptional() @IsEnum(StoreStatus)
  status: StoreStatus = 'PENDING_APPROVAL';
}
