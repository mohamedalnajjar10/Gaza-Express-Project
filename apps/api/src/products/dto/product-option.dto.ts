import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateProductOptionDto {
  @ApiProperty({ example: 'Extra Cheese', description: 'اسم الخيار' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(191)
  optionName: string;

  @ApiPropertyOptional({ example: 'جبنة إضافية', description: 'اسم الخيار بالعربية' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  optionNameAr?: string;

  @ApiPropertyOptional({ example: 3.5, default: 0, description: 'التكلفة الإضافية بالشيكل' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  extraCost?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class UpdateProductOptionDto {
  @ApiPropertyOptional({ example: 'Extra Cheese' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(191)
  optionName?: string;

  @ApiPropertyOptional({ nullable: true, example: 'جبنة إضافية' })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(191)
  optionNameAr?: string | null;

  @ApiPropertyOptional({ example: 3.5 })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  extraCost?: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isAvailable?: boolean;
}
