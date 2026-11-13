import { PrismaService } from 'prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { SubCategoryController } from './subcategory.controller';
import { SubCategoryService } from './subcategory.service';

describe('SubCategoryController', () => {
  let controller: SubCategoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubCategoryController],
      providers: [SubCategoryService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = module.get<SubCategoryController>(SubCategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
