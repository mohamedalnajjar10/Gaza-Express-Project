import { api, json } from '../../shared/api/client';

export type Address = {
  id: number;
  label: string;
  address: string;
  latitude: string;
  longitude: string;
  area?: string | null;
  residenceType?: 'APARTMENT' | 'HOUSE' | 'OFFICE';
  building?: string | null;
  floor?: string | null;
  street?: string | null;
  phone?: string | null;
  directions?: string | null;
};

export function getAddresses(signal?: AbortSignal) {
  return api<Address[]>('/addresses?limit=100', { signal });
}

export type AddressInput = Omit<Address, 'id' | 'latitude' | 'longitude'> & { latitude: number; longitude: number };
export function saveAddress(data: AddressInput, id?: number) {
  return api<Address>(id ? `/addresses/${id}` : '/addresses/default', json('PUT', data));
}
