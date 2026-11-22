import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AUTH_CONSTANTS } from '../constants/auth.constants';
import { RegistrationProfileDto } from './register.dto';

export class VerifyOtpDto extends RegistrationProfileDto {
    @ApiProperty({
        example: '123456',
        description: 'Verification code',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @Length(AUTH_CONSTANTS.OTP_LENGTH, AUTH_CONSTANTS.OTP_LENGTH, { message: `OTP must be exactly ${AUTH_CONSTANTS.OTP_LENGTH} characters` })
    @Matches(/^\d+$/)
    code: string;
}
