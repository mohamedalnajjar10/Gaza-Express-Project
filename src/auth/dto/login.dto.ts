import { IsString, IsNotEmpty, MinLength, Matches, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AUTH_CONSTANTS } from '../constants/auth.constants';
import { UserRole } from '@prisma/client';

export class LoginDto {
    @ApiProperty({
        example: '0599123456',
        description: 'Phone number',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^0(59|56)\d{7}$/, {
        message: 'Phone number must be in format: 059XXXXXXXX or 056XXXXXXXX',
    })
    phone: string;

    @ApiProperty({
        example: 'P@ssw0rd123',
        description: 'Password',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH)
    password: string;

    @ApiProperty({
        example: 'customer',
        description: 'User role: customer, store_owner, driver, admin',
        required: false,
        enum: UserRole,
    })
    @IsEnum(UserRole, { message: 'Invalid role specified' })
    @IsOptional()
    role?: UserRole = UserRole.customer;
}