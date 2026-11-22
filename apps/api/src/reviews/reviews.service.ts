import { Prisma } from '@prisma/client';
import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { CatalogCache } from 'src/infrastructure/catalog-cache';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CatalogCache) {}

  async create(userId: number, dto: CreateReviewDto) {
    const review = await this.prisma.$transaction(async tx => {
      await this.lockStore(tx, dto.storeId);
      const store = await tx.store.findUnique({ where: { storeId: dto.storeId, status: 'ACTIVE' } });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      const existing = await tx.review.findUnique({
        where: { storeId_userId: { storeId: dto.storeId, userId } },
      });

      if (existing) {
        throw new BadRequestException('You have already reviewed this store');
      }

      const review = await tx.review.create({
        data: {
          storeId: dto.storeId,
          userId,
          rating: dto.rating,
          comment: dto.comment,
        },
        include: {
          user: {
            select: { full_name: true, full_name_ar: true },
          },
        },
      });

      await this.updateStoreRating(tx, dto.storeId);
      return review;
    });
    await this.cache.invalidate();

    return review;
  }

  async findByStore(storeId: number, page = new PageDto()) {
    const store = await this.prisma.store.findUnique({
      where: { storeId, status: 'ACTIVE' },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return this.prisma.review.findMany({
      ...pageWindow(page),
      where: { storeId },
      include: {
        user: {
          select: { full_name: true, full_name_ar: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { reviewId: 'desc' }],
    });
  }

  async remove(userId: number, reviewId: number, userRole: string) {
    const review = await this.prisma.review.findUnique({
      where: { reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    const storeId = review.storeId;

    await this.prisma.$transaction(async tx => {
      await this.lockStore(tx, storeId);
      await tx.review.delete({ where: { reviewId } });
      await this.updateStoreRating(tx, storeId);
    });
    await this.cache.invalidate();

    return { message: 'Review deleted successfully' };
  }

  private async lockStore(tx: Prisma.TransactionClient, storeId: number) {
    await tx.$queryRaw`SELECT store_id FROM stores WHERE store_id = ${storeId} FOR UPDATE`;
  }

  private async updateStoreRating(tx: Prisma.TransactionClient, storeId: number) {
    const result = await tx.review.aggregate({
      where: { storeId },
      _avg: { rating: true },
    });

    await tx.store.update({
      where: { storeId },
      data: {
        avgRating: result._avg.rating ?? 0,
      },
    });
  }
}
