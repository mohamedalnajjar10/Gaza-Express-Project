import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
    @ApiProperty({ example: '0599123456' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ example: 'Mohammed Ahmed' })
    @IsString()
    @IsNotEmpty()
    full_name: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @IsNotEmpty()
    password: string;

    @ApiProperty({ example: 'Mohammed Ahmed', required: false })
    @IsString()
    @IsOptional()
    full_name_ar?: string;

    @ApiProperty({ example: 'email@example.com', required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ enum: UserRole, required: false })
    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;
}