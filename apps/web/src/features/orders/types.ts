export type Order = {
  id: number;
  storeId: number;
  version: number;
  status: string;
  storeName: string;
  currency: string;
  estimatedMin: string;
  estimatedMax: string;
  proposedTotal?: string;
  finalTotal?: string;
  paymentMethod: string;
  requiresQuote: boolean;
  offeredDriverId?: number;
  offerExpiresAt?: string;
  createdAt: string;
  events?: { id: number; toStatus: string; createdAt: string }[];
  itemSnapshots?: { productId: number; nameAr: string; quantity: number }[];
};
