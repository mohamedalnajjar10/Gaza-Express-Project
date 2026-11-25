import { type Store } from '../catalog/types';

export type ManagedStore = Store & {
  status: string;
  areaId: number;
  categoryId: number;
  phone?: string | null;
  fullAddressAr?: string | null;
  fullAddress?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  deliveryRangeKm?: string | number;
  planTier?: 'FREE' | 'PRO';
  commissionBps?: number | null;
  deliveryBaseFee?: string | number | null;
  deliveryPerKmFee?: string | number | null;
  freeDeliveryThreshold?: string | number | null;
};
export const storeStatuses: Record<string, string> = {
  PENDING_APPROVAL: 'بانتظار المراجعة',
  ACTIVE: 'معتمد',
  SUSPENDED: 'موقوف',
  CLOSED_TEMPORARILY: 'مغلق مؤقتًا',
  INACTIVE: 'غير نشط',
};
export const transitions: Record<string, string[]> = {
  PENDING_APPROVAL: ['ACTIVE', 'INACTIVE'],
  ACTIVE: ['SUSPENDED', 'CLOSED_TEMPORARILY', 'INACTIVE'],
  SUSPENDED: ['ACTIVE', 'INACTIVE'],
  CLOSED_TEMPORARILY: ['ACTIVE', 'SUSPENDED', 'INACTIVE'],
  INACTIVE: ['PENDING_APPROVAL'],
};
