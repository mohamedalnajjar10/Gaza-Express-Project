import { PrismaService } from 'prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  const findMany = jest.fn().mockResolvedValue([]);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: { product: { findMany } } }],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('looks ahead without skipping the extra row on the next page', async () => {
    await service.findByStore(1, true, { page: 2, limit: 25, lookahead: '1' });
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 25, take: 26 }));
    await service.findByStore(1, true, { page: 2, limit: 25 });
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 25, take: 25 }));
  });
});
