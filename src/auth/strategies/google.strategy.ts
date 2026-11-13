import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export type GoogleIdentity = { googleId: string; email: string; full_name: string; profile_photo_url?: string };

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({ clientID: config.getOrThrow('GOOGLE_CLIENT_ID'), clientSecret: config.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow('GOOGLE_CALLBACK_URL'), scope: ['email', 'profile'], });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleIdentity {
    const email = profile.emails?.[0];
    if (!profile.id || !email?.value || email.verified !== true) throw new UnauthorizedException('Verified Google email required');
    return { googleId: profile.id, email: email.value.toLowerCase(), full_name: (profile.displayName || 'Google User').slice(0, 100), profile_photo_url: profile.photos?.[0]?.value };
  }
}
