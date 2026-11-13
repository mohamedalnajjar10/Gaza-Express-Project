import { IsString, Matches } from 'class-validator';
export class ResendOtpDto {
 @IsString()
 @Matches(/^0(59|56)\d{7}$/)
 phone: string;
}
