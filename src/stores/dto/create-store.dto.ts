import {
    IsString, IsNumber, IsOptional, IsBoolean, IsEnum,
    IsDecimal, IsInt, Min, Max, IsUrl, MinLength
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { StoreStatus } from '@prisma/client';

export class CreateStoreDto {
    @ApiProperty({ description: 'معرف فئة المتجر' })
    @Type(() => Number)
    @IsInt()
    categoryId: number;

    @ApiProperty({ description: 'معرف المنطقة' })
    @Type(() => Number)
    @IsInt()
    areaId: number;

    @ApiProperty({ example: 'Al-Sham Restaurant', description: 'اسم المتجر بالإنجليزية' })
    @IsString()
    @MinLength(2)
    storeName: string;

    @ApiProperty({ example: 'مطعم الشام', description: 'اسم المتجر بالعربية' })
    @IsString()
    @MinLength(2)
    storeNameAr: string;

    @ApiPropertyOptional({ example: 'أفضل مطعم شامي' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ example: 'أفضل مطعم شامي في غزة' })
    @IsString()
    @IsOptional()
    descriptionAr?: string;

    @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
    @IsUrl()
    @IsOptional()
    logoUrl?: string;

    @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
    @IsUrl()
    @IsOptional()
    coverImageUrl?: string;

    @ApiPropertyOptional({ example: '0599123456' })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiPropertyOptional({ example: '0599123456' })
    @IsString()
    @IsOptional()
    whatsappNumber?: string;

    @ApiPropertyOptional({ example: 'Gaza, Al-Rimal' })
    @IsString()
    @IsOptional()
    fullAddress?: string;

    @ApiPropertyOptional({ example: 'غزة، الرمال' })
    @IsString()
    @IsOptional()
    fullAddressAr?: string;

    @ApiPropertyOptional({ example: 31.5017 })
    @Type(() => Number)
    @IsDecimal()
    @IsOptional()
    latitude?: number;

    @ApiPropertyOptional({ example: 34.4668 })
    @Type(() => Number)
    @IsDecimal()
    @IsOptional()
    longitude?: number;

    @ApiPropertyOptional({ example: '08:00:00', default: '08:00:00' })
    @IsString()
    @IsOptional()
    opensAt?: string;

    @ApiPropertyOptional({ example: '22:00:00', default: '22:00:00' })
    @IsString()
    @IsOptional()
    closesAt?: string;

    @ApiPropertyOptional({ example: 50, default: 0 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    minOrderAmount?: number;

    @ApiPropertyOptional({ example: 30, default: 30 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    estimatedPrepMin?: number;

    @ApiPropertyOptional({ example: 10, default: 10 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    deliveryRangeKm?: number;

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    isOpenNow?: boolean;
}