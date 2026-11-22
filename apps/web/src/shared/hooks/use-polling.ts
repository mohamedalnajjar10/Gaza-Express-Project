import { useEffect } from 'react';

export function usePolling(reload: () => void, interval: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function refresh() {
      if (document.visibilityState === 'visible') reload();
    }
    const timer = window.setInterval(refresh, interval);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload, interval, enabled]);
}
