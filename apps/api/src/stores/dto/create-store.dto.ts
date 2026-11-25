import {
    Matches, IsString, IsNumber, IsOptional, IsBoolean,
    IsLatitude, IsLongitude, IsInt, Min, Max, IsUrl, MinLength, MaxLength, ValidateIf
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class CreateStoreDto {
    @ApiProperty({ description: 'معرف فئة المتجر' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    categoryId: number;

    @ApiProperty({ description: 'معرف المنطقة' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    areaId: number;

    @ApiProperty({ example: 'Al-Sham Restaurant', description: 'اسم المتجر بالإنجليزية' })
    @IsString()
    @MinLength(2)
    @MaxLength(191)
    storeName: string;

    @ApiProperty({ example: 'مطعم الشام', description: 'اسم المتجر بالعربية' })
    @IsString()
    @MinLength(2)
    @MaxLength(191)
    storeNameAr: string;

    @ApiPropertyOptional({ example: 'أفضل مطعم شامي' })
    @IsString()
    @MaxLength(4000)
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ example: 'أفضل مطعم شامي في غزة' })
    @IsString()
    @MaxLength(4000)
    @IsOptional()
    descriptionAr?: string;

    @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
    @IsUrl()
    @MaxLength(191)
    @IsOptional()
    logoUrl?: string;

    @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
    @IsUrl()
    @MaxLength(191)
    @IsOptional()
    coverImageUrl?: string;

    @ApiPropertyOptional({ example: '0599123456' })
    @IsString()
    @MaxLength(20)
    @IsOptional()
    phone?: string;

    @ApiPropertyOptional({ example: '0592229436', description: 'رقم التحويل عبر بنك فلسطين (اختياري، الافتراضي رقم المنصة 0592229436)' })
    @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value))
    @IsOptional()
    @Matches(/^0(?:59|56)\d{7}$/, { message: 'رقم التحويل عبر بنك فلسطين يجب أن يتكون من 10 أرقام ويبدأ بـ 059 أو 056' })
    bankTransferPhone?: string | null;

    @ApiPropertyOptional({ example: '0599123456' })
    @IsString()
    @MaxLength(20)
    @IsOptional()
    whatsappNumber?: string;

    @ApiPropertyOptional({ example: 'Gaza, Al-Rimal' })
    @IsString()
    @MaxLength(500)
    @IsOptional()
    fullAddress?: string;

    @ApiPropertyOptional({ example: 'غزة، الرمال' })
    @IsString()
    @MaxLength(500)
    @IsOptional()
    fullAddressAr?: string;

    @ApiPropertyOptional({ nullable: true, example: 31.5017 })
    @IsOptional()
    @Transform(({ value }) => (value === null || value === '' ? null : typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
    @ValidateIf((_, value) => value !== null)
    @IsLatitude()
    latitude?: number | null;

    @ApiPropertyOptional({ nullable: true, example: 34.4668 })
    @IsOptional()
    @Transform(({ value }) => (value === null || value === '' ? null : typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
    @ValidateIf((_, value) => value !== null)
    @IsLongitude()
    longitude?: number | null;

    @ApiPropertyOptional({ example: '08:00:00', default: '08:00:00' })
    @IsString()
    @MaxLength(20)
    @IsOptional()
    opensAt?: string;

    @ApiPropertyOptional({ example: '22:00:00', default: '22:00:00' })
    @IsString()
    @MaxLength(20)
    @IsOptional()
    closesAt?: string;

    @ApiPropertyOptional({ example: 50, default: 0 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(0)
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
    @Min(0)
    deliveryRangeKm?: number;

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    isOpenNow?: boolean;

    @ApiPropertyOptional({ nullable: true, example: 5, description: 'رسوم التوصيل الأساسية بالشيكل' })
    @IsOptional()
    @Transform(({ value }) => (value === null || value === '' ? null : typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(1000)
    deliveryBaseFee?: number | null;

    @ApiPropertyOptional({ nullable: true, example: 1.5, description: 'رسوم التوصيل لكل كيلومتر بالشيكل' })
    @IsOptional()
    @Transform(({ value }) => (value === null || value === '' ? null : typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(500)
    deliveryPerKmFee?: number | null;

    @ApiPropertyOptional({ nullable: true, example: 100, description: 'الحد الأدنى للطلب للحصول على توصيل مجاني' })
    @IsOptional()
    @Transform(({ value }) => (value === null || value === '' ? null : typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100000)
    freeDeliveryThreshold?: number | null;
}