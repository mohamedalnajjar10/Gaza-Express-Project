import { ApiError, api, json } from '../../shared/api/client';

export type Cart = {
  storeId: number | null;
  version: number;
  items: { productId: number; quantity: number; optionIds: number[] }[];
  products: { productId: number; nameAr: string; isAvailable: boolean }[];
};

export function getCart(signal?: AbortSignal) {
  return api<Cart>('/cart', { signal });
}

export function replaceCart(version: number, items: Cart['items']) {
  return api('/cart', json('PUT', { version, items }));
}

export async function addCartItem(
  storeId: number,
  productId: number,
  quantity: number,
  optionIds: number[],
) {
  const cart = await getCart();
  if (cart.storeId && cart.storeId !== storeId && cart.items.length) {
    throw new ApiError(
      400,
      'يمكنك الطلب من متجر واحد. أفرغ سلتك قبل إضافة منتجات هذا المتجر.',
    );
  }
  const sortedOptionIds = [...optionIds].sort((a, b) => a - b);
  const index = cart.items.findIndex(
    item =>
      item.productId === productId &&
      JSON.stringify([...item.optionIds].sort((a, b) => a - b)) ===
        JSON.stringify(sortedOptionIds),
  );
  const items = [...cart.items];
  if (index >= 0)
    items[index] = {
      ...items[index],
      quantity: items[index].quantity + quantity,
    };
  else items.push({ productId, quantity, optionIds: sortedOptionIds });
  return replaceCart(cart.version, items);
}
