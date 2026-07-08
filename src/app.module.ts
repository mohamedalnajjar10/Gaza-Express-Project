import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OtpModule } from './otp/otp.module';
import { SmsModule } from './sms/sms.module';
import { PrismaModule } from 'prisma/prisma.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { CategoriesModule } from './categories/categories.module';
import { SubCategoryModule } from './subcategory/subcategory.module';
import { StoreCategoriesModule } from './store-categories/store-categories.module';
import { ProductCategoriesModule } from './product-categories/product-categories.module';
import { StoresModule } from './stores/stores.module';
import { ProductsModule } from './products/products.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ReviewsModule } from './reviews/reviews.module';

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
    CategoriesModule,
    SubCategoryModule,
    StoreCategoriesModule,
    ProductCategoriesModule,
    StoresModule,
    ProductsModule,
    FavoritesModule,
    ReviewsModule,
  ],
  controllers: [AppController],
})
export class AppModule { }