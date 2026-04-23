import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(private configService: ConfigService) {
        super({
            clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
            clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
            passReqToCallback: true,
        });
    }

    async validate(
        _req: Request,
        accessToken: string,
        _refreshToken: string,
        profile: any,
        done: VerifyCallback,
    ): Promise<any> {
        const { id: googleId, emails, name, photos } = profile;

        const userData = {
            googleId,                                  
            email: emails?.[0]?.value?.toLowerCase(),
            full_name: `${name?.givenName || ''} ${name?.familyName || ''}`.trim(),
            profile_photo_url: photos?.[0]?.value,      
            provider: 'google' as const,
            accessToken,
        };

        done(null, userData);
    }
}