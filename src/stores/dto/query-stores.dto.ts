import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum StoreSortBy {
    RATING = 'rating',
    DELIVERY_TIME = 'delivery_time',
    NAME_AZ = 'name_az',
    NEWEST = 'newest',
}

export class QueryStoresDto {
    @ApiPropertyOptional({ description: 'معرف الفئة' })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    categoryId?: number;

    @ApiPropertyOptional({ description: 'معرف المنطقة' })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    areaId?: number;

    @ApiPropertyOptional({ description: 'البحث بالاسم' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({
        description: 'الترتيب',
        enum: StoreSortBy,
        default: StoreSortBy.RATING
    })
    @IsEnum(StoreSortBy)
    @IsOptional()
    sortBy?: StoreSortBy;

    @ApiPropertyOptional({ description: 'رقم الصفحة', default: 1 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    page?: number;

    @ApiPropertyOptional({ description: 'عدد النتائج', default: 20 })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    limit?: number;
}