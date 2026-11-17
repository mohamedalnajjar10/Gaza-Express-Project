import { useEffect, useState } from 'react';
import { api } from '../../shared/api/client';

export function AccountAvatar({
  src,
  name,
  compact = false,
}: {
  src?: string | null;
  name: string;
  compact?: boolean;
}) {
  const [loaded, setLoaded] = useState<{ src: string; url: string }>();
  const [failed, setFailed] = useState<string>();
  const local = src?.startsWith('/api/v1/account/images/');
  useEffect(() => {
    if (!src || !local) return;
    const controller = new AbortController();
    let url: string | undefined;
    void api<Blob>(
      src.slice('/api/v1'.length),
      { signal: controller.signal },
      true,
      'blob',
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setLoaded({ src, url });
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, local]);
  const url = local ? (loaded?.src === src ? loaded?.url : undefined) : src;
  return (
    <span className={compact ? "header-avatar" : "account-avatar"}>
      {url && failed !== url ? (
        <img
          src={url}
          alt={compact ? "" : `الصورة الشخصية لـ ${name}`}
          onError={() => setFailed(url)}
        />
      ) : (
        <span aria-hidden="true">
          {name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join(' ')}
        </span>
      )}
    </span>
  );
}
