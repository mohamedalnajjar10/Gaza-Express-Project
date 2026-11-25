import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { lockCustomer, priceCart } from './cart-pricing';
import type { CartItemDto, ReplaceCartDto } from './orders.dto';

type Actor = { user_id: number; role: UserRole };
const emptyCart = { version: 0, storeId: null, items: [] };

@Injectable()
export class CartService {
  constructor(private readonly db: PrismaService) {}

  private customer(actor: Actor) {
    if (actor.role !== 'customer') throw new ForbiddenException('Customer account required');
    return actor.user_id;
  }

  async cart(actor: Actor) {
    const cart = (await this.db.shoppingCart.findUnique({ where: { customerId: this.customer(actor) } })) ?? emptyCart;
    const items = cart.items as CartItemDto[];
    if (!items.length) return { ...cart, store: null, items, products: [], estimatedMin: '0', estimatedMax: '0' };
    const [store, products] = await Promise.all([
      cart.storeId ? this.db.store.findUnique({
        where: { storeId: cart.storeId },
        select: {
          storeName: true, storeNameAr: true, planTier: true,
          latitude: true, longitude: true, deliveryRangeKm: true, minOrderAmount: true,
          deliveryBaseFee: true, deliveryPerKmFee: true, freeDeliveryThreshold: true,
        },
      }) : null,
      this.db.product.findMany({
      where: { productId: { in: items.map(item => item.productId) } },
      select: {
        productId: true, nameAr: true, imageUrl: true, unitAr: true, isAvailable: true,
        estimatedPriceMin: true, estimatedPriceMax: true, isPriceFixed: true,
        productOptions: { select: { optionId: true, optionName: true, optionNameAr: true, extraCost: true, isAvailable: true } },
      },
      }),
    ]);
    const byId = new Map(products.map(product => [product.productId, product]));
    let min = new Prisma.Decimal(0);
    let max = new Prisma.Decimal(0);
    for (const item of items) {
      const product = byId.get(item.productId);
      const options = product?.productOptions.filter(option => option.isAvailable && item.optionIds.includes(option.optionId));
      if (!product?.isAvailable || options?.length !== item.optionIds.length) {
        return { ...cart, store, items, products, estimatedMin: null, estimatedMax: null, needsReview: true };
      }
      const extra = options.reduce((sum, option) => sum.plus(option.extraCost), new Prisma.Decimal(0));
      min = min.plus(product.estimatedPriceMin.plus(extra).times(item.quantity));
      max = max.plus((product.isPriceFixed ? product.estimatedPriceMin : product.estimatedPriceMax).plus(extra).times(item.quantity));
    }
    return { ...cart, store, items, products, estimatedMin: min.toString(), estimatedMax: max.toString() };
  }

  async replaceCart(actor: Actor, dto: ReplaceCartDto) {
    const customerId = this.customer(actor);
    return this.db.$transaction(async tx => {
      await lockCustomer(tx, customerId);
      const current = await tx.shoppingCart.findUnique({ where: { customerId } });
      if ((current?.version ?? 0) !== dto.version) throw new ConflictException('Cart has changed');
      const catalog = dto.items.length ? await priceCart(tx, dto.items) : null;
      const items = dto.items.map(({ productId, quantity, optionIds }) => ({ productId, quantity, optionIds }));
      const data = { storeId: catalog?.store.storeId ?? null, items, version: dto.version + 1 };
      const cart = await tx.shoppingCart.upsert({ where: { customerId }, create: { customerId, ...data }, update: data });
      return { ...cart, items, estimatedMin: catalog?.min.toString() ?? '0', estimatedMax: catalog?.max.toString() ?? '0' };
    });
  }

}
