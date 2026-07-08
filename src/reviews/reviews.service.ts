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
  constructor(private readonly prisma: PrismaService) { }

  async create(userId: number, dto: CreateReviewDto) {
    const store = await this.prisma.store.findUnique({
      where: { storeId: dto.storeId },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const existing = await this.prisma.review.findUnique({
      where: { storeId_userId: { storeId: dto.storeId, userId } },
    });

    if (existing) {
      throw new BadRequestException('You have already reviewed this store');
    }

    const review = await this.prisma.review.create({
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

    await this.updateStoreRating(dto.storeId);

    return review;
  }

  async findByStore(storeId: number) {
    const store = await this.prisma.store.findUnique({
      where: { storeId },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return this.prisma.review.findMany({
      where: { storeId },
      include: {
        user: {
          select: { full_name: true, full_name_ar: true },
        },
      },
      orderBy: { createdAt: 'desc' },
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

    await this.prisma.review.delete({
      where: { reviewId },
    });

    await this.updateStoreRating(storeId);

    return { message: 'Review deleted successfully' };
  }

  private async updateStoreRating(storeId: number) {
    const result = await this.prisma.review.aggregate({
      where: { storeId },
      _avg: { rating: true },
    });

    await this.prisma.store.update({
      where: { storeId },
      data: {
        avgRating: result._avg.rating ?? 0,
      },
    });
  }
}
