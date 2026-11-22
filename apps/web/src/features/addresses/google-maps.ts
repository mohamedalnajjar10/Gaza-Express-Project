let pending: Promise<void> | undefined;

export function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (pending) return pending;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return Promise.reject(new Error('Maps unavailable'));
  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const callback = '__gazaMapsReady';
    const globals = window as unknown as Record<string, unknown>;
    const fail = () => {
      clearTimeout(timer);
      delete globals[callback];
      script.remove();
      pending = undefined;
      reject(new Error('Maps could not load'));
    };
    const timer = window.setTimeout(fail, 15_000);
    globals[callback] = () => {
      clearTimeout(timer);
      delete globals[callback];
      resolve();
    };
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, loading: 'async', callback, language: 'ar', v: 'quarterly' })}`;
    script.async = true;
    script.onerror = fail;
    globals.gm_authFailure = () => {
      window.dispatchEvent(new Event('google-maps-auth-failure'));
      fail();
    };
    document.head.append(script);
  });
  return pending;
}

export type MapPoint = { lat: number; lng: number };
export function roundPoint(point: MapPoint): MapPoint {
  return { lat: Number(point.lat.toFixed(8)), lng: Number(point.lng.toFixed(8)) };
}
