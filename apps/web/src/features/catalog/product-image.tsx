import { useEffect, useRef, useState } from 'react';
import { api } from '../../shared/api/client';

export function ProductImage({ src }: { src: string }) {
  const path = /^\/api\/v1\/products\/images\/[a-f0-9-]+\.webp$/.test(src)
    ? src.slice('/api/v1'.length) : null;
  const placeholder = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<{ path: string; url: string }>();

  useEffect(() => {
    if (!path || !placeholder.current) return;
    const controller = new AbortController();
    let url: string | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void api<Blob>(path, { signal: controller.signal }, true, 'blob').then(blob => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage({ path, url });
      }).catch(() => undefined);
    }, { rootMargin: '200px' });
    observer.observe(placeholder.current);
    return () => {
      observer.disconnect();
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (!path) return <img src={src} alt="" loading="lazy" />;
  return image?.path === path
    ? <img src={image.url} alt="" />
    : <div ref={placeholder} className="product-image-placeholder" aria-hidden="true" />;
}
