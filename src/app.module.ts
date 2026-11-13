import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { validateEnvironment } from './config/environment';
import { RedisModule, RedisStorage } from './infrastructure/redis.module';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OtpModule } from './otp/otp.module';
import { SmsModule } from './sms/sms.module';
import { PrismaModule } from 'prisma/prisma.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
      validate: validateEnvironment,
      envFilePath: process.env.ENV_FILE || (process.env.NODE_ENV === 'test' ? '.env.test' : process.env.NODE_ENV === 'production' ? '.env.production' : '.env'),
      ignoreEnvFile: false,
    }),

    // Schedule for cron jobs
    // ScheduleModule.forRoot(),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, RedisStorage],
      useFactory: (config: ConfigService, storage: RedisStorage) => ({
        storage,
        skipIf: () => config.get('LOAD_TEST_MODE') === '1',
        throttlers: [
          {
            ttl: Number(config.get('RATE_LIMIT_TTL', 60000)),
            limit: Number(config.get('RATE_LIMIT_MAX_REQUESTS', 100)),
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
    OrdersModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule { }