import {
    IsString,
    IsBoolean,
    IsEmail,
    ValidateIf,
    IsEnum,
    MinLength,
    MaxLength
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, LanguagePref } from '@prisma/client';
import { AUTH_CONSTANTS } from '../../auth/constants/auth.constants';
import { PasswordBytes } from '../../auth/dto/password-bytes';

export class UpdateUserDto {
    @ApiPropertyOptional({ description: 'Administrator attestation of independently verified account ownership' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsBoolean()
    is_verified?: boolean;

    @ApiPropertyOptional({ description: 'Account active status' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsBoolean()
    is_active?: boolean;

    @ApiPropertyOptional({ example: 'Ahmed Mohamed' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @MaxLength(AUTH_CONSTANTS.MAX_FULL_NAME_LENGTH)
    full_name?: string;

    @ApiPropertyOptional({ example: 'Ahmed Mohammed' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @MaxLength(AUTH_CONSTANTS.MAX_FULL_NAME_LENGTH)
    full_name_ar?: string;

    @ApiPropertyOptional({ example: 'ahmed@example.com' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ example: 'newPassword123' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @MinLength(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH)
    @PasswordBytes()
    password?: string;

    @ApiPropertyOptional({ enum: UserRole })
    @ValidateIf((_object, value) => value !== undefined)
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ enum: LanguagePref })
    @ValidateIf((_object, value) => value !== undefined)
    @IsEnum(LanguagePref)
    language_pref?: LanguagePref;
}
