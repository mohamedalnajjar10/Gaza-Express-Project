import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({
        example: '0599123456',
        description: 'Phone number',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({
        example: 'password123',
        description: 'Password',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password: string;
}