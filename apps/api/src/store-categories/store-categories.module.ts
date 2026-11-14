import { Module } from '@nestjs/common';
import { StoreCategoriesController } from './store-categories.controller';
import { StoreCategoriesService } from './store-categories.service';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StoreCategoriesController],
  providers: [StoreCategoriesService],
  exports: [StoreCategoriesService],
})
export class StoreCategoriesModule { }