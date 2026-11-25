import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { useResource } from '../../shared/hooks/use-resource';
import { getCart, replaceCart, type Cart } from '../cart/cart-api';

export function useStoreCart(storeId: number, enabled: boolean) {
  const state = useResource(
    signal => (enabled ? getCart(signal) : Promise.resolve(null)),
    `store-cart:${storeId}:${enabled}`,
  );
  const [updated, setUpdated] = useState<Cart>();
  const [pending, setPending] = useState<number>();
  const [error, setError] = useState<{ productId: number; reason: unknown }>();
  const busy = useRef(false);

  useEffect(() => {
    setUpdated(undefined);
  }, [state.data]);

  const cart = updated ?? state.data;
  const reloadCart = state.reload;
  const reload = useCallback(() => {
    setUpdated(undefined);
    reloadCart();
  }, [reloadCart]);

  async function change(productId: number, optionIds: number[], delta: 1 | -1) {
    if (!cart || busy.current) return false;
    setError(undefined);
    if (cart.storeId && cart.storeId !== storeId && cart.items.length) {
      setError({ productId, reason: new ApiError(400, 'سلّتك تحتوي على منتجات من متجر آخر. راجعها قبل الإضافة.') });
      return false;
    }
    const options = [...optionIds].sort((a, b) => a - b);
    const index = cart.items.findIndex(
      item =>
        item.productId === productId &&
        [...(item.optionIds ?? [])].sort((a, b) => a - b).join(',') === options.join(','),
    );
    const quantity = (cart.items[index]?.quantity ?? 0) + delta;
    if (quantity < 0 || quantity > 99) return false;
    const items = [...cart.items];
    if (quantity === 0) items.splice(index, 1);
    else if (index >= 0) items[index] = { ...items[index], quantity };
    else items.push({ productId, quantity, optionIds: options });
    busy.current = true;
    setPending(productId);
    try {
      setUpdated(await replaceCart(cart.version, items));
      return true;
    } catch (reason) {
      setError({ productId, reason });
      // Reconcile against the server in case a different tab changed the cart,
      // or the request succeeded but its response was interrupted.
      try { setUpdated(await getCart()); } catch { /* keep the last confirmed cart */ }
      return false;
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  }

  return { cart, pending, change, error, loadError: state.error, reload };
}
