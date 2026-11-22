import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PasswordBytes } from '../../auth/dto/password-bytes';

export class CreateUserDto {
    @ApiProperty({ example: '0599123456' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    phone: string;

    @ApiProperty({ example: 'Mohammed Ahmed' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    full_name: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @IsNotEmpty()
    @PasswordBytes()
    password: string;

    @ApiProperty({ example: 'Mohammed Ahmed', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(200)
    full_name_ar?: string;

    @ApiProperty({ example: 'email@example.com', required: false })
    @IsEmail()
    @IsOptional()
    @MaxLength(255)
    email?: string;

    @ApiProperty({ enum: UserRole, required: false })
    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;
}
