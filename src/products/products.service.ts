import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(userId: number, dto: CreateProductDto) {
    const store = await this.prisma.store.findUnique({
      where: { storeId: dto.storeId },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    if (store.ownerId !== userId) {
      throw new ForbiddenException('You are not the owner of this store');
    }

    if (dto.prodCategoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { prodCategoryId: dto.prodCategoryId },
      });
      if (!category || category.storeId !== dto.storeId) {
        throw new BadRequestException('Product category not found');
      }
    }

    return this.prisma.product.create({
      data: dto,
      include: { productCategory: true },
    });
  }

  async findByStore(storeId: number, availableOnly = true, page = new PageDto()) {
    return this.prisma.product.findMany({
      ...pageWindow(page),
      where: {
        storeId,
        ...(availableOnly && { isAvailable: true }),
      },
      include: {
        productCategory: true,
        productOptions: { take: 20, orderBy: { optionId: 'asc' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { productId: 'asc' }],
    });
  }

  findOptions(productId: number, page: PageDto) {
    return this.prisma.productOption.findMany({ where: { productId }, orderBy: { optionId: 'asc' }, ...pageWindow(page) });
  }

  async findOne(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { productId },
      include: {
        store: { select: { storeName: true, storeNameAr: true } },
        productCategory: true,
        productOptions: { take: 20, orderBy: { optionId: 'asc' } },
      },
    });

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(userId: number, productId: number, dto: Partial<CreateProductDto>) {
    const product = await this.findOne(productId);
    await this.verifyStoreOwnership(product.storeId, userId);

    if (dto.prodCategoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { prodCategoryId: dto.prodCategoryId },
      });
      if (!category || category.storeId !== product.storeId) {
        throw new BadRequestException('Product category not found');
      }
    }

    return this.prisma.product.update({
      where: { productId },
      data: dto,
    });
  }

  async toggleAvailability(userId: number, productId: number) {
    const product = await this.findOne(productId);
    await this.verifyStoreOwnership(product.storeId, userId);
    return this.prisma.product.update({
      where: { productId },
      data: { isAvailable: !product.isAvailable },
    });
  }

  async delete(userId: number, productId: number) {
    const product = await this.findOne(productId);
    await this.verifyStoreOwnership(product.storeId, userId);
    await this.prisma.product.delete({ where: { productId } });
    return { message: 'Product deleted successfully' };
  }

  private async verifyStoreOwnership(storeId: number, userId: number) {
    const store = await this.prisma.store.findUnique({ where: { storeId } });
    if (!store) throw new NotFoundException('Store not found');
    if (store.ownerId !== userId) throw new ForbiddenException('You are not the owner of this store');
  }

  async search(storeId: number, query: string, page = new PageDto()) {
    return this.prisma.product.findMany({
      ...pageWindow(page),
      where: {
        storeId,
        isAvailable: true,
        OR: [
          { nameAr: { contains: query } },
          { nameEn: { contains: query } },
        ],
      },
      orderBy: { productId: 'asc' },
      include: { productOptions: { take: 20, orderBy: { optionId: 'asc' } } },
    });
  }
}
