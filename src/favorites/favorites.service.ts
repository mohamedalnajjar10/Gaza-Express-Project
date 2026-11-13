import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) { }

  // Store Favorites
  async addStoreToFavorites(userId: number, storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { storeId } });
    if (!store) throw new NotFoundException('Store not found');
    return this.prisma.storeFavorite.create({
      data: { userId, storeId },
      include: { store: { include: { storeCategory: true } } },
    });
  }

  async removeStoreFromFavorites(userId: number, storeId: number) {
    const favorite = await this.prisma.storeFavorite.findUnique({
      where: { userId_storeId: { userId, storeId } },
    });
    if (!favorite) throw new NotFoundException('Store not found in favorites');
    await this.prisma.storeFavorite.delete({ where: { favoriteId: favorite.favoriteId } });
    return { message: 'Removed from favorites' };
  }

  async getMyFavoriteStores(userId: number, page = new PageDto()) {
    return this.prisma.storeFavorite.findMany({
      ...pageWindow(page), orderBy: { favoriteId: 'desc' },
      where: { userId },
      include: {
        store: {
          include: {
            storeCategory: true,
            _count: { select: { reviews: true } },
          },
        },
      },
    });
  }

  async isStoreFavorite(userId: number, storeId: number) {
    const favorite = await this.prisma.storeFavorite.findUnique({
      where: { userId_storeId: { userId, storeId } },
    });
    return !!favorite;
  }

  // Product Favorites
  async addProductToFavorites(userId: number, productId: number) {
    const product = await this.prisma.product.findUnique({ where: { productId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.productFavorite.create({
      data: { userId, productId },
      include: {
        product: {
          include: {
            store: { select: { storeName: true, storeNameAr: true } },
          },
        },
      },
    });
  }

  async removeProductFromFavorites(userId: number, productId: number) {
    const favorite = await this.prisma.productFavorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!favorite) throw new NotFoundException('Product not found in favorites');
    await this.prisma.productFavorite.delete({ where: { favoriteId: favorite.favoriteId } });
    return { message: 'Removed from favorites' };
  }

  async getMyFavoriteProducts(userId: number, page = new PageDto()) {
    return this.prisma.productFavorite.findMany({
      ...pageWindow(page), orderBy: { favoriteId: 'desc' },
      where: { userId },
      include: {
        product: {
          include: {
            store: { select: { storeName: true, storeNameAr: true } },
            productOptions: { take: 20, orderBy: { optionId: 'asc' } },
          },
        },
      },
    });
  }

  async isProductFavorite(userId: number, productId: number) {
    const favorite = await this.prisma.productFavorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    return !!favorite;
  }
}
