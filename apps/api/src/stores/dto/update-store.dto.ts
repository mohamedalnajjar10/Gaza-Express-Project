import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CreateStoreDto } from './create-store.dto';

export class UpdateStoreDto extends PartialType(
  OmitType(CreateStoreDto, [
    'categoryId',
    'areaId',
    'storeName',
    'storeNameAr',
    'minOrderAmount',
    'estimatedPrepMin',
    'deliveryRangeKm',
    'isOpenNow',
  ] as const),
) {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  areaId?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  storeName?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  storeNameAr?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedPrepMin?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryRangeKm?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isOpenNow?: boolean;
}
