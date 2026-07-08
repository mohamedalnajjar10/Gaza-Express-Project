import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateStoreCategoryDto {
    @ApiProperty({ example: 'مطاعم', description: 'الاسم بالعربية' })
    @IsString()
    nameAr: string;

    @ApiProperty({ example: 'Restaurants', description: 'الاسم بالإنجليزية' })
    @IsString()
    @IsOptional()
    nameEn?: string;

    @ApiPropertyOptional({ example: '🍔' })
    @IsString()
    @IsOptional()
    iconUrl?: string;

    @ApiPropertyOptional({ example: '#FF5722' })
    @IsString()
    @IsOptional()
    colorHex?: string;

    @ApiPropertyOptional({ example: 0 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    sortOrder?: number;

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}