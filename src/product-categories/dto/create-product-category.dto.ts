import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductCategoryDto {
    @ApiProperty({ description: 'معرف المتجر' })
    @Type(() => Number)
    @IsInt()
    storeId: number;

    @ApiProperty({ example: 'ألبان', description: 'الاسم بالعربية' })
    @IsString()
    nameAr: string;

    @ApiProperty({ example: 'Dairy', description: 'الاسم بالإنجليزية' })
    @IsString()
    @IsOptional()
    nameEn?: string;

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

export class UpdateProductCategoryDto {
    @ApiPropertyOptional({ example: 'ألبان', description: 'الاسم بالعربية' })
    @IsString()
    @IsOptional()
    nameAr?: string;

    @ApiPropertyOptional({ example: 'Dairy', description: 'الاسم بالإنجليزية' })
    @IsString()
    @IsOptional()
    nameEn?: string;

    @ApiPropertyOptional({ example: 0 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    sortOrder?: number;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
