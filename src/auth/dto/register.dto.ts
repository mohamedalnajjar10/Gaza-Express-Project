import {
    IsString,
    IsNotEmpty,
    MinLength,
    IsOptional,
    IsEmail,
    Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

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

    @ApiProperty({ example: 'Mohammed Ahmed', description: 'Full name', required: true })
    @IsString()
    @IsNotEmpty()
    @MinLength(3, { message: 'Full name must be at least 3 characters' })
    full_name: string;

    @ApiProperty({ example: 'Mohammed Ahmed', description: 'Name in English', required: false })
    @IsString()
    @IsOptional()
    full_name_ar?: string;

    @ApiProperty({ example: 'password123', description: 'Password', required: true })
    @IsNotEmpty()
    @IsString()
    @MinLength(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH)
    @Matches(/(?=.*[a-z])/, { message: 'Password must contain a lowercase letter' })
    @Matches(/(?=.*[A-Z])/, { message: 'Password must contain an uppercase letter' })
    @Matches(/(?=.*\d)/, { message: 'Password must contain a number' })
    @Matches(/(?=.*[@$!%*?&])/, { message: 'Password must contain a special character' })
    password: string;


    @ApiProperty({ example: 'user@example.com', description: 'Email', required: false })
    @IsEmail({}, { message: 'Invalid email format' })
    @IsOptional()
    email?: string;
}