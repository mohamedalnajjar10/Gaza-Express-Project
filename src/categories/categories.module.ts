import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { CategoryController } from './categories.controller';
import { SubCategoryController } from 'src/subcategory/subcategory.controller';
import { SubCategoryService } from 'src/subcategory/subcategory.service';
import { CategoryService } from './categories.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule
  ],
  controllers: [CategoryController, SubCategoryController],
  providers: [CategoryService, SubCategoryService],
  exports: [CategoryService, SubCategoryService]
})
export class CategoriesModule { }