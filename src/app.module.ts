import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OtpModule } from './otp/otp.module';
import { SmsModule } from './sms/sms.module';
import { PrismaModule } from 'prisma/prisma.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: false,
    }),

    // Schedule for cron jobs
    // ScheduleModule.forRoot(),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('RATE_LIMIT_TTL', 60),
            limit: config.get<number>('RATE_LIMIT_MAX_REQUESTS', 10),
          },
        ],
      }),
    }),

    // Feature Modules
    PrismaModule,
    AuthModule,
    UserModule,
    OtpModule,
    SmsModule,
  ],
  controllers: [AppController],
})
export class AppModule { }