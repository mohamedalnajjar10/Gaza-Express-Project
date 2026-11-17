import { IsString, IsOptional, IsBoolean, IsInt, Min, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductCategoryDto {
    @ApiProperty({ description: 'معرف المتجر' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    storeId: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    parentId?: number;

    @ApiProperty({ example: 'ألبان', description: 'الاسم بالعربية' })
    @IsString()
    @MinLength(2)
    @MaxLength(191)
    nameAr: string;

    @ApiProperty({ example: 'Dairy', description: 'الاسم بالإنجليزية' })
    @IsString()
    @IsOptional()
    @MaxLength(191)
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
    @MinLength(2)
    @MaxLength(191)
    nameAr?: string;

    @ApiPropertyOptional({ example: 'Dairy', description: 'الاسم بالإنجليزية' })
    @IsString()
    @IsOptional()
    @MaxLength(191)
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
