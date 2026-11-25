import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CartItemDto } from './orders.dto';

export async function lockCustomer(tx: Prisma.TransactionClient, customerId: number) {
  await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${customerId} FOR UPDATE`;
}

export async function priceCart(tx: Prisma.TransactionClient, items: CartItemDto[]) {
  const products = await tx.product.findMany({
    where: { productId: { in: items.map(item => item.productId) } }, include: { productOptions: true, store: true },
  });
  const byId = new Map(products.map(product => [product.productId, product]));
  const store = products[0]?.store;
  const uniqueLines = new Set<string>();
  let min = new Prisma.Decimal(0);
  let max = new Prisma.Decimal(0);
  let requiresQuote = false;
  const snapshots = items.map(item => {
    const product = byId.get(item.productId);
    if (!product?.isAvailable) throw new ConflictException('A product is unavailable');
    if (product.storeId !== store.storeId) throw new BadRequestException('Cart must contain products from one store');
    const lineKey = `${item.productId}:${[...item.optionIds].sort((a, b) => a - b).join(',')}`;
    if (uniqueLines.has(lineKey)) throw new BadRequestException('Duplicate cart item');
    uniqueLines.add(lineKey);
    const options = new Map(product.productOptions.map(option => [option.optionId, option]));
    let extra = new Prisma.Decimal(0);
    const selected = item.optionIds.map(id => {
      const option = options.get(id);
      if (!option?.isAvailable || option.extraCost.lt(0)) throw new ConflictException('A selected option is unavailable');
      extra = extra.plus(option.extraCost);
      return { optionId: id, name: option.optionName, nameAr: option.optionNameAr, extraCost: option.extraCost.toFixed(2) };
    });
    if (product.estimatedPriceMin.lt(0) || (!product.isPriceFixed && product.estimatedPriceMax.lt(product.estimatedPriceMin))) {
      throw new ConflictException('Product price is invalid');
    }
    const unitMin = product.estimatedPriceMin.plus(extra);
    const unitMax = (product.isPriceFixed ? product.estimatedPriceMin : product.estimatedPriceMax).plus(extra);
    min = min.plus(unitMin.times(item.quantity));
    max = max.plus(unitMax.times(item.quantity));
    requiresQuote ||= !product.isPriceFixed;
    return { productId: item.productId, nameAr: product.nameAr, nameEn: product.nameEn, quantity: item.quantity, unitMin: unitMin.toFixed(2), unitMax: unitMax.toFixed(2), options: selected };
  });
  if (max.gt('999999999999.99')) throw new BadRequestException('Order amount exceeds supported limit');
  return { store, snapshots, min, max, requiresQuote };
}
