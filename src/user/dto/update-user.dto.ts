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
import { AUTH_CONSTANTS } from '../../auth/constants/auth.constants';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'Ahmed Mohamed' })
    @IsOptional()
    @IsString()
    @MaxLength(AUTH_CONSTANTS.MAX_FULL_NAME_LENGTH)
    full_name?: string;

    @ApiPropertyOptional({ example: 'Ahmed Mohammed' })
    @IsOptional()
    @IsString()
    @MaxLength(AUTH_CONSTANTS.MAX_FULL_NAME_LENGTH)
    full_name_ar?: string;

    @ApiPropertyOptional({ example: 'ahmed@example.com' })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ example: 'newPassword123' })
    @IsOptional()
    @IsString()
    @MinLength(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH)
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