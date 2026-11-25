const noteKey = (storeId: number) => `gaza-express.cart-note:${storeId}`;

export function getCartNote(storeId?: number | null): string {
  if (!storeId) return '';
  try {
    return sessionStorage.getItem(noteKey(storeId)) ?? '';
  } catch {
    return '';
  }
}

export function setCartNote(storeId: number | null | undefined, note: string) {
  if (!storeId) return;
  try {
    if (note) sessionStorage.setItem(noteKey(storeId), note);
    else sessionStorage.removeItem(noteKey(storeId));
  } catch {
    // Ignore storage failures when private mode disables sessionStorage.
  }
}

export function clearCartNote(storeId?: number | null) {
  if (!storeId) return;
  try {
    sessionStorage.removeItem(noteKey(storeId));
  } catch {
    // Ignore storage failures.
  }
}
