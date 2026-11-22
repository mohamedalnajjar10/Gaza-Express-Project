import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { PrismaService } from 'prisma/prisma.service';
import { ProductMediaService } from './product-media.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly media?: ProductMediaService) { }

  async create(userId: number, dto: CreateProductDto, image?: Buffer) {
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
      if (!category?.isActive || category.storeId !== dto.storeId) {
        throw new BadRequestException('Product category not found');
      }
    }

    this.assertNonNullable(dto);
    const min = dto.estimatedPriceMin ?? 0;
    const max = dto.estimatedPriceMax ?? min;
    this.validatePrices(min, max, dto.isPriceFixed ?? false);
    return this.saveImage(image, imageUrl => this.prisma.product.create({
      data: { ...dto, estimatedPriceMin: min, estimatedPriceMax: max, ...(imageUrl && { imageUrl }) },
      include: { productCategory: true },
    }));
  }

  async findByStore(storeId: number, availableOnly = true, page: PageDto & { categoryId?: number; q?: string } = new PageDto(), viewerId?: number) {
    if (!availableOnly) {
      if (viewerId === undefined) throw new ForbiddenException('Store ownership required');
      await this.verifyStoreOwnership(storeId, viewerId);
    }
    return this.prisma.product.findMany({
      ...pageWindow(page),
      where: {
        storeId,
        ...(availableOnly && { isAvailable: true, store: { status: 'ACTIVE' } }),
        ...(page.q && { OR: [{ nameAr: { contains: page.q } }, { nameEn: { contains: page.q } }] }),
        ...(page.categoryId && {
          productCategory: {
            isActive: true,
            OR: [{ prodCategoryId: page.categoryId }, { parentId: page.categoryId, parent: { isActive: true, storeId } }],
          },
        }),
      },
      include: {
        productCategory: true,
        productOptions: { take: 20, orderBy: { optionId: 'asc' } },
      },
      orderBy: [{ sortOrder: 'asc' }, { productId: 'asc' }],
    });
  }

  bestSellers(storeId: number) {
    return this.prisma.product.findMany({
      where: { storeId, isAvailable: true, soldQuantity: { gt: 0 }, store: { status: 'ACTIVE' } },
      orderBy: [{ soldQuantity: 'desc' }, { productId: 'asc' }],
      take: 12,
      include: { productCategory: true, productOptions: { take: 20, orderBy: { optionId: 'asc' } } },
    });
  }

  findOptions(productId: number, page: PageDto, viewerId?: number) {
    return this.prisma.productOption.findMany({ where: { productId, product: this.visibility(viewerId) }, orderBy: { optionId: 'asc' }, ...pageWindow(page) });
  }

  async findOne(productId: number, viewerId?: number) {
    const product = await this.prisma.product.findUnique({
      where: { ...this.visibility(viewerId), productId },
      include: {
        store: { select: { storeName: true, storeNameAr: true } },
        productCategory: true,
        productOptions: { take: 20, orderBy: { optionId: 'asc' } },
      },
    });

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(userId: number, productId: number, dto: Partial<CreateProductDto>, image?: Buffer) {
    const product = await this.findOne(productId, userId);
    await this.verifyStoreOwnership(product.storeId, userId);

    if (dto.prodCategoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { prodCategoryId: dto.prodCategoryId },
      });
      if (!category || category.storeId !== product.storeId) {
        throw new BadRequestException('Product category not found');
      }
    }

    const changesPrice = dto.estimatedPriceMin !== undefined || dto.estimatedPriceMax !== undefined || dto.isPriceFixed !== undefined;
    this.assertNonNullable(dto);
    if (changesPrice) {
      this.validatePrices(dto.estimatedPriceMin ?? Number(product.estimatedPriceMin), dto.estimatedPriceMax ?? Number(product.estimatedPriceMax), dto.isPriceFixed ?? product.isPriceFixed);
    }
    const changesImage = image !== undefined || dto.imageUrl !== undefined;
    const updated = await this.saveImage(image, imageUrl => this.prisma.product.update({
      where: { productId, ...(changesImage && { imageUrl: product.imageUrl }), ...(changesPrice && { estimatedPriceMin: product.estimatedPriceMin, estimatedPriceMax: product.estimatedPriceMax, isPriceFixed: product.isPriceFixed }) },
      data: { ...dto, ...(imageUrl && { imageUrl }) },
    })).catch(error => {
      if ((changesImage || changesPrice) && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('تغيّرت بيانات المنتج. حدّث الصفحة وحاول مرة أخرى.');
      }
      throw error;
    });
    if (changesImage && updated.imageUrl !== product.imageUrl) await this.media?.remove(product.imageUrl);
    return updated;
  }

  async toggleAvailability(userId: number, productId: number, isAvailable: boolean) {
    const product = await this.findOne(productId, userId);
    await this.verifyStoreOwnership(product.storeId, userId);
    return this.prisma.product.update({ where: { productId }, data: { isAvailable } });
  }

  async delete(userId: number, productId: number) {
    const product = await this.findOne(productId, userId);
    await this.verifyStoreOwnership(product.storeId, userId);
    const deleted = await this.prisma.product.delete({ where: { productId } });
    await this.media?.remove(deleted?.imageUrl);
    return { message: 'Product deleted successfully' };
  }

  openImage(name: string) {
    return this.imageStorage().open(name);
  }

  private imageStorage() {
    if (!this.media) throw new ServiceUnavailableException('Product image storage unavailable');
    return this.media;
  }

  private async saveImage<T>(image: Buffer | undefined, save: (imageUrl?: string) => Promise<T>) {
    if (!image) return save();
    const media = this.imageStorage();
    const imageUrl = await media.upload(image);
    try {
      return await save(imageUrl);
    } catch (error) {
      await media.remove(imageUrl);
      throw error;
    }
  }

  private assertNonNullable(dto: Partial<CreateProductDto>) {
    for (const field of ['nameAr', 'estimatedPriceMin', 'estimatedPriceMax', 'isPriceFixed', 'isAvailable', 'sortOrder'] as const) {
      if (dto[field] === null) throw new BadRequestException(`${field} cannot be null`);
    }
  }

  private visibility(viewerId?: number): Prisma.ProductWhereInput {
    const published: Prisma.ProductWhereInput = { isAvailable: true, store: { status: 'ACTIVE' } };
    return viewerId === undefined ? published : { OR: [published, { store: { ownerId: viewerId } }] };
  }

  private validatePrices(min: number, max: number, fixed: boolean) {
    if (max < min || (fixed && min !== max)) {
      throw new BadRequestException('تحقق من نطاق السعر. السعر الثابت يتطلب تساوي السعر الأدنى والأعلى.');
    }
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
        store: { status: 'ACTIVE' },
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
