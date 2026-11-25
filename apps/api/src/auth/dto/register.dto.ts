import {
    IsString,
    IsNotEmpty,
    MinLength,
    IsOptional, MaxLength,
    IsEmail,
    Matches,
    IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AUTH_CONSTANTS } from '../constants/auth.constants';
import { UserRole } from '@prisma/client';
import { PasswordBytes } from './password-bytes';

const registrationRoles = [UserRole.customer, UserRole.store_owner, UserRole.driver] as const;
export type RegistrationRole = (typeof registrationRoles)[number];

export class RegisterDto {
    @ApiProperty({
        example: '0599123456',
        description: 'Phone number (must start with 059 or 056)',
        required: true,
    })
    @IsString()
    @IsNotEmpty({ message: 'Phone number is required' })
    @Matches(/^0(59|56)\d{7}$/, {
        message: 'Phone number must start with 059 or 056 and consist of 10 digits',
    })
    phone: string;

    @ApiProperty({ example: 'customer', required: false, enum: registrationRoles })
    @IsIn(registrationRoles, { message: 'Invalid registration role' })
    @IsOptional()
    role?: RegistrationRole;
}

export class RegistrationProfileDto extends RegisterDto {
    @ApiProperty({ example: 'Mohammed Ahmed', description: 'Full name', required: true })
    @IsString()
    @IsNotEmpty()
    @MinLength(3, { message: 'Full name must be at least 3 characters' })
    @MaxLength(100)
    @Matches(/\S/)
    full_name: string;

    @ApiProperty({ example: 'Mohammed Ahmed', description: 'Name in English', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    full_name_ar?: string;

    @ApiProperty({ example: 'Example!Pass42', description: 'Password', required: true })
    @IsNotEmpty()
    @IsString()
    @MinLength(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH)
    @PasswordBytes()
    @Matches(/(?=.*[a-z])/, { message: 'Password must contain a lowercase letter' })
    @Matches(/(?=.*[A-Z])/, { message: 'Password must contain an uppercase letter' })
    @Matches(/(?=.*\d)/, { message: 'Password must contain a number' })
    @Matches(/(?=.*[@$!%*?&])/, { message: 'Password must contain a special character' })
    password: string;


    @ApiProperty({ example: 'user@example.com', description: 'Email', required: false })
    @IsEmail({}, { message: 'Invalid email format' })
    @MaxLength(255)
    @IsOptional()
    email?: string;
}
