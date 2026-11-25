import { useCallback, useEffect, useRef, useState } from 'react';

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
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      data => {
        if (!controller.signal.aborted) setState({ key, data });
      },
      error => {
        if (!controller.signal.aborted) {
          setState(previous => ({
            key,
            data: previous.key === key ? previous.data : undefined,
            error,
          }));
        }
      },
    );
    return () => controller.abort();
  }, [key, revision]);

  return {
    ...(state.key === key ? state : { key }),
    reload: useCallback(() => reload(x => x + 1), []),
  };
}
