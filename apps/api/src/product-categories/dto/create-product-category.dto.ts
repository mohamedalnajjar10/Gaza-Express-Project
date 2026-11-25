import { IsString, IsOptional, IsBoolean, IsInt, Min, MinLength, MaxLength, ValidateIf } from 'class-validator';
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
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @MinLength(2)
    @MaxLength(191)
    nameAr?: string;

    @ApiPropertyOptional({ nullable: true, example: 'Dairy', description: 'الاسم بالإنجليزية' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsString()
    @MaxLength(191)
    nameEn?: string | null;

    @ApiPropertyOptional({ example: 0 })
    @ValidateIf((_, value) => value !== undefined)
    @Type(() => Number)
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @ApiPropertyOptional()
    @ValidateIf((_, value) => value !== undefined)
    @IsBoolean()
    isActive?: boolean;
}
