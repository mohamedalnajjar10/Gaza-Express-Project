import type { Product } from '../catalog/types';
import { api, json } from '../../shared/api/client';

export type Cart = {
  storeId: number | null;
  version: number;
  items: { productId: number; quantity: number; optionIds: number[] }[];
  estimatedMin: string | null;
  estimatedMax: string | null;
  needsReview?: boolean;
  store?: {
    storeName: string;
    storeNameAr?: string | null;
    planTier?: 'FREE' | 'PRO';
    latitude?: string | number | null;
    longitude?: string | number | null;
    deliveryRangeKm?: string | number | null;
    minOrderAmount?: string | number | null;
    deliveryBaseFee?: string | number | null;
    deliveryPerKmFee?: string | number | null;
    freeDeliveryThreshold?: string | number | null;
  } | null;
  products?: (Pick<Product, 'productId' | 'nameAr' | 'imageUrl' | 'unitAr' | 'estimatedPriceMin' | 'estimatedPriceMax' | 'isPriceFixed' | 'productOptions'> & { isAvailable: boolean })[];
};

export function getCart(signal?: AbortSignal) {
  return api<Cart>('/cart', { signal });
}

export function replaceCart(version: number, items: Cart['items']) {
  return api<Cart>('/cart', json('PUT', { version, items }));
}
