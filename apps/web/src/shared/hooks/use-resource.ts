import { useCallback, useEffect, useState } from 'react';

export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
) {
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: unknown;
  }>({ key });
  const [revision, reload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      data => {
        if (!controller.signal.aborted) setState({ key, data });
      },
      error => {
        if (!controller.signal.aborted) setState({ key, error });
      },
    );
    return () => controller.abort();
    // The caller's key identifies all request parameters.
  }, [key, revision]);
  return {
    ...(state.key === key ? state : { key }),
    reload: useCallback(() => reload(x => x + 1), []),
  };
}
