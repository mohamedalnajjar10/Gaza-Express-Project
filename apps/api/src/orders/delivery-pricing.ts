import { Prisma } from '@prisma/client';

export type DeliveryPricingStore = {
  deliveryBaseFee?: Prisma.Decimal | string | number | null;
  deliveryPerKmFee?: Prisma.Decimal | string | number | null;
  freeDeliveryThreshold?: Prisma.Decimal | string | number | null;
};

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lon2 - lon1) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function calculateDeliveryFee(
  rawDistanceKm: number,
  itemsSubtotal: Prisma.Decimal,
  store: DeliveryPricingStore,
  defaults: { baseFee: Prisma.Decimal; perKmFee: Prisma.Decimal },
) {
  const roundedDistance = new Prisma.Decimal(rawDistanceKm).toDecimalPlaces(2);
  const threshold = store.freeDeliveryThreshold !== null && store.freeDeliveryThreshold !== undefined
    ? new Prisma.Decimal(store.freeDeliveryThreshold)
    : null;
  if (threshold !== null && itemsSubtotal.gte(threshold)) {
    return {
      distanceKm: roundedDistance,
      deliveryFee: new Prisma.Decimal(0).toDecimalPlaces(2),
      freeDeliveryApplied: true,
    };
  }
  const baseFee = store.deliveryBaseFee !== null && store.deliveryBaseFee !== undefined
    ? new Prisma.Decimal(store.deliveryBaseFee)
    : defaults.baseFee;
  const perKmFee = store.deliveryPerKmFee !== null && store.deliveryPerKmFee !== undefined
    ? new Prisma.Decimal(store.deliveryPerKmFee)
    : defaults.perKmFee;
  return {
    distanceKm: roundedDistance,
    deliveryFee: baseFee.plus(perKmFee.times(roundedDistance)).toDecimalPlaces(2),
    freeDeliveryApplied: false,
  };
}
