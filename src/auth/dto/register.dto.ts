import {
    IsString,
    IsNotEmpty,
    MinLength,
    IsOptional,
    IsEmail,
    Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
    @IsString()
    @IsNotEmpty()
    @MinLength(6, { message: 'Password must be at least 6 characters' })
    password: string;

    @ApiProperty({ example: 'user@example.com', description: 'Email', required: false })
    @IsEmail({}, { message: 'Invalid email format' })
    @IsOptional()
    email?: string;
}