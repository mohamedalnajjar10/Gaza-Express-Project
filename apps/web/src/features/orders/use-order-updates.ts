import { useEffect, useState } from 'react';
import { api, ApiError } from '../../shared/api/client';

export function useOrderUpdates(reload: () => void, enabled = true) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let connection: AbortController | undefined;
    let retryTimer: number | undefined;
    let reloadTimer: number | undefined;
    let delay = 1000;

    async function connect() {
      if (disposed || connection || document.visibilityState !== 'visible') return;
      const attempt = new AbortController();
      connection = attempt;
      let retryAfter = 0;
      const handshake = window.setTimeout(() => attempt.abort(), 12_000);
      try {
        const stream = await api<ReadableStream<Uint8Array>>('/orders/updates', {
          signal: attempt.signal, headers: { Accept: 'text/event-stream' },
        }, true, 'event-stream');
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let pending = '';
        while (!disposed) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          let changed = false;
          for (const line of lines) {
            if (line === 'data: ready') {
              window.clearTimeout(handshake);
              setConnected(true);
              delay = 1000;
            } else if (line === 'data: changed') {
              changed = true;
            }
          }
          if (changed && reloadTimer === undefined) {
            reloadTimer = window.setTimeout(() => {
              reloadTimer = undefined;
              reload();
            }, 200);
          }
          if (pending.length > 4096) attempt.abort();
        }
      } catch (error) {
        if (error instanceof ApiError) retryAfter = (error.retryAfterSeconds ?? 0) * 1000;
      } finally {
        window.clearTimeout(handshake);
        connection = undefined;
        if (!disposed) {
          setConnected(false);
          if (document.visibilityState === 'visible') {
            retryTimer = window.setTimeout(() => void connect(), Math.max(delay, retryAfter));
            delay = Math.min(delay * 2, 30_000);
          }
        }
      }
    }

    function visibilityChanged() {
      window.clearTimeout(retryTimer);
      if (document.visibilityState === 'visible') void connect();
      else connection?.abort();
    }

    document.addEventListener('visibilitychange', visibilityChanged);
    void connect();
    return () => {
      disposed = true;
      connection?.abort();
      window.clearTimeout(retryTimer);
      window.clearTimeout(reloadTimer);
      document.removeEventListener('visibilitychange', visibilityChanged);
      setConnected(false);
    };
  }, [enabled, reload]);
  return enabled && connected;
}
