import { api } from '../../shared/api/client';

export type Address = {
  id: number;
  label: string;
  address: string;
  latitude: string;
  longitude: string;
};

export function getAddresses(signal?: AbortSignal) {
  return api<Address[]>('/addresses', { signal });
}
