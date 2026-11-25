import { ApiPropertyOptional } from '@nestjs/swagger';
import { StorePlanTier } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class StoreMonetizationDto {
  @ApiPropertyOptional({ enum: StorePlanTier })
  @IsOptional()
  @IsEnum(StorePlanTier)
  planTier?: StorePlanTier;

  @ApiPropertyOptional({ nullable: true, example: 500, description: 'نسبة عمولة مخصصة للمتجر بنقاط الأساس (500 = 5%)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  commissionBps?: number | null;
}
