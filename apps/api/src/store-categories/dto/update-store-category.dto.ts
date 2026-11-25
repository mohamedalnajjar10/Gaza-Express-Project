import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { CreateStoreCategoryDto } from './create-store-category.dto';

export class UpdateStoreCategoryDto extends PartialType(
  OmitType(CreateStoreCategoryDto, ['nameAr', 'sortOrder', 'isActive'] as const),
) {
  @ApiPropertyOptional({ example: 'مطاعم', description: 'الاسم بالعربية' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(191)
  nameAr?: string;

  @ApiPropertyOptional({ example: 0 })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
