import {
    IsString, IsNumber, IsOptional, IsBoolean,
    IsInt, Min, Max, IsUrl, MinLength, MaxLength
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

const multipartBoolean = ({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value;

const productPrice = ({ value }: { value: unknown }) => {
    if (value == null) return value;
    const price = typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value)
        ? Number(value)
        : value;
    return typeof price === 'number' && Number.isFinite(price) && price === Number(price.toFixed(2))
        ? price
        : Number.NaN;
};

export class CreateProductDto {
    @ApiProperty({ description: 'معرف المتجر' })
    @Type(() => Number)
    @IsInt()
    storeId: number;

    @ApiPropertyOptional({ description: 'معرف فئة المنتج' })
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    @Min(1)
    prodCategoryId?: number;

    @ApiProperty({ example: 'Fresh Milk', description: 'الاسم بالإنجليزية' })
    @IsString()
    @MinLength(2)
    @MaxLength(191)
    nameEn: string;

    @ApiProperty({ example: 'حليب طازج', description: 'الاسم بالعربية' })
    @IsString()
    @MinLength(2)
    @MaxLength(191)
    nameAr: string;

    @ApiPropertyOptional({ example: 'حليب بقري طازج' })
    @IsString()
    @IsOptional()
    @MaxLength(4000)
    descriptionEn?: string;

    @ApiPropertyOptional({ example: 'حليب بقري طازج يومياً' })
    @IsString()
    @IsOptional()
    @MaxLength(4000)
    descriptionAr?: string;

    @ApiPropertyOptional({ example: 'https://example.com/milk.jpg' })
    @IsUrl()
    @MaxLength(191)
    @IsOptional()
    imageUrl?: string;

    @ApiPropertyOptional({ example: 5, default: 0 })
    @Transform(productPrice)
    @IsNumber({}, { message: 'السعر الأدنى يجب أن يكون رقمًا بمنزلتين عشريتين كحد أقصى.' })
    @Max(99_999_999.99)
    @Min(0)
    @IsOptional()
    estimatedPriceMin?: number;

    @ApiPropertyOptional({ example: 8, default: 0 })
    @Transform(productPrice)
    @IsNumber({}, { message: 'السعر الأعلى يجب أن يكون رقمًا بمنزلتين عشريتين كحد أقصى.' })
    @Max(99_999_999.99)
    @Min(0)
    @IsOptional()
    estimatedPriceMax?: number;

    @ApiPropertyOptional({ example: 'السعر تقريبي' })
    @IsString()
    @IsOptional()
    @MaxLength(191)
    priceNoteAr?: string;

    @ApiPropertyOptional({ example: 'piece' })
    @IsString()
    @IsOptional()
    unit?: string;

    @ApiPropertyOptional({ example: 'قطعة' })
    @IsString()
    @IsOptional()
    @MaxLength(191)
    unitAr?: string;

    @ApiPropertyOptional({ default: true })
    @Transform(multipartBoolean)
    @IsBoolean()
    @IsOptional()
    isAvailable?: boolean;

    @ApiPropertyOptional({ default: false, description: 'هل السعر ثابت أم تقريبي' })
    @Transform(multipartBoolean)
    @IsBoolean()
    @IsOptional()
    isPriceFixed?: boolean;

    @ApiPropertyOptional({ example: 0, default: 0 })
    @Type(() => Number)
    @IsInt()
    @IsOptional()
    sortOrder?: number;
}
