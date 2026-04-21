import {
    IsString,
    IsEmail,
    IsOptional,
    IsEnum,
    MinLength,
    MaxLength
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, LanguagePref } from '@prisma/client';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'Ahmed Mohamed' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    full_name?: string;

    @ApiPropertyOptional({ example: 'Ahmed Mohammed' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    full_name_ar?: string;

    @ApiPropertyOptional({ example: 'ahmed@example.com' })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ example: 'newPassword123' })
    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

    @ApiPropertyOptional({ enum: UserRole })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ enum: LanguagePref })
    @IsOptional()
    @IsEnum(LanguagePref)
    language_pref?: LanguagePref;
}