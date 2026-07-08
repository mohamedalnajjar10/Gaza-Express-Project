import {
    IsString, IsNumber, IsOptional, IsBoolean, IsDecimal,
    IsInt, Min, IsUrl, MinLength
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductDto {
    @ApiProperty({ description: 'معرف المتجر' })
    @Type(() => Number)
    @IsInt()
    storeId: number;

    @ApiPropertyOptional({ description: 'معرف فئة المنتج' })
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    prodCategoryId?: number;

    @ApiProperty({ example: 'Fresh Milk', description: 'الاسم بالإنجليزية' })
    @IsString()
    @MinLength(2)
    nameEn: string;

    @ApiProperty({ example: 'حليب طازج', description: 'الاسم بالعربية' })
    @IsString()
    @MinLength(2)
    nameAr: string;

    @ApiPropertyOptional({ example: 'حليب بقري طازج' })
    @IsString()
    @IsOptional()
    descriptionEn?: string;

    @ApiPropertyOptional({ example: 'حليب بقري طازج يومياً' })
    @IsString()
    @IsOptional()
    descriptionAr?: string;

    @ApiPropertyOptional({ example: 'https://example.com/milk.jpg' })
    @IsUrl()
    @IsOptional()
    imageUrl?: string;

    @ApiPropertyOptional({ example: 5, default: 0 })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    estimatedPriceMin?: number;

    @ApiPropertyOptional({ example: 8, default: 0 })
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    estimatedPriceMax?: number;

    @ApiPropertyOptional({ example: 'السعر تقريبي' })
    @IsString()
    @IsOptional()
    priceNoteAr?: string;

    @ApiPropertyOptional({ example: 'piece' })
    @IsString()
    @IsOptional()
    unit?: string;

    @ApiPropertyOptional({ example: 'قطعة' })
    @IsString()
    @IsOptional()
    unitAr?: string;

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    isAvailable?: boolean;

    @ApiPropertyOptional({ default: false, description: 'هل السعر ثابت أم تقريبي' })
    @IsBoolean()
    @IsOptional()
    isPriceFixed?: boolean;

    @ApiPropertyOptional({ example: 0, default: 0 })
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    sortOrder?: number;
}
