import { CatalogCache } from 'src/infrastructure/catalog-cache';
import { PrismaService } from 'prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { StoreCategoriesService } from './store-categories.service';

describe('StoreCategoriesService', () => {
  let service: StoreCategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StoreCategoriesService, { provide: PrismaService, useValue: {} }, { provide: CatalogCache, useValue: {} }],
    }).compile();

    service = module.get<StoreCategoriesService>(StoreCategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
