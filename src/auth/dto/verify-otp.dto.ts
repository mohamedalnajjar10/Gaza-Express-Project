import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
    @ApiProperty({
        example: '0599123456',
        description: 'Phone number',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({
        example: '123456',
        description: 'Verification code',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    code: string;
}