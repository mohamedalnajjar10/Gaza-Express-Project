import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CreateSubCategoryDto } from './create-subcategory.dto';

export class UpdateSubCategoryDto extends PartialType(
  OmitType(CreateSubCategoryDto, ['name', 'categoryId', 'isActive'] as const),
) {
  @ApiPropertyOptional({ minLength: 2 })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  categoryId?: number;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
