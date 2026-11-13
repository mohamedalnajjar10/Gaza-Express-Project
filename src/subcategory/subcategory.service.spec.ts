import { PrismaService } from 'prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { SubCategoryService } from './subcategory.service';

describe('SubCategoryService', () => {
  let service: SubCategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubCategoryService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get<SubCategoryService>(SubCategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
