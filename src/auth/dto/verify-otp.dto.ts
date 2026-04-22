import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

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
    @Length(AUTH_CONSTANTS.OTP_LENGTH, AUTH_CONSTANTS.OTP_LENGTH, { message: `OTP must be exactly ${AUTH_CONSTANTS.OTP_LENGTH} characters` })
    code: string;
}