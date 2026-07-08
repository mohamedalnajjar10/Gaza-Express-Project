import { IsString, IsOptional, IsNumber, IsBoolean, MinLength, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubCategoryDto {
    @ApiProperty({ minLength: 2 })
    @IsString()
    @MinLength(2)
    name: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    nameAr?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional()
    @IsUrl({}, { message: 'Invalid image URL' })
    @IsOptional()
    image?: string;

    @ApiProperty()
    @IsNumber()
    categoryId: number;

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}