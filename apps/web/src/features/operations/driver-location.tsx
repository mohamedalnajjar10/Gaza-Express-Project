import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, json } from '../../shared/api/client';

const locationPath = '/drivers/me/location';
const Sharing = createContext<{
  sharing: boolean;
  message: string;
  stopping: boolean;
  toggle: () => void;
} | null>(null);

export function DriverLocationProvider({ children }: { children: ReactNode }) {
  const [sharing, setSharing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState('');
  const update = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (!sharing) return;
    let active = true;
    let locating = false;

    function publish() {
      if (locating || document.visibilityState !== 'visible') return;
      locating = true;
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        locating = false;
        if (!active) return;
        if (coords.accuracy > 1000) {
          setMessage('دقة الموقع منخفضة. يمكنك اختيار منطقة التوصيل يدويًا.');
          return;
        }
        const request = api(locationPath, json('PUT', {
          latitude: Number(coords.latitude.toFixed(8)),
          longitude: Number(coords.longitude.toFixed(8)),
        }));
        update.current = request;
        void request.then(() => {
          if (active) setMessage('موقعك محدّث.');
        }, () => {
          if (active) setMessage('تعذّر تحديث موقعك. ستُعاد المحاولة تلقائيًا.');
        }).finally(() => {
          if (update.current === request) update.current = null;
        });
      }, error => {
        locating = false;
        if (!active) return;
        if (error.code === error.PERMISSION_DENIED) setSharing(false);
        setMessage('تعذّر تحديد موقعك. راجع إذن الموقع في المتصفح.');
      }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 });
    }

    function refresh() {
      if (!update.current) publish();
    }
    publish();
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [sharing]);

  async function toggle() {
    if (!sharing) {
      if (!navigator.geolocation || !window.isSecureContext) {
        setMessage('مشاركة الموقع تحتاج متصفحًا يدعم الموقع واتصالًا آمنًا.');
        return;
      }
      setMessage('جارٍ تحديد موقعك…');
      setSharing(true);
      return;
    }
    setSharing(false);
    setStopping(true);
    try {
      await update.current?.catch(() => undefined);
      await api(locationPath, { method: 'DELETE' });
      setMessage('أوقفت مشاركة موقعك.');
    } catch {
      setSharing(true);
      setMessage('تعذّر تأكيد إيقاف المشاركة. حاول مرة أخرى.');
    } finally {
      setStopping(false);
    }
  }

  return <Sharing.Provider value={{ sharing, message, stopping, toggle }}>{children}</Sharing.Provider>;
}

export function DriverLocationControl() {
  const location = useContext(Sharing);
  if (!location) return null;
  return <div className="form">
    <button type="button" className="secondary" disabled={location.stopping} onClick={location.toggle}>
      {location.sharing ? 'إيقاف مشاركة الموقع' : 'مشاركة موقعي للتوصيل'}
    </button>
    <small>يُستخدم موقعك لترتيب عروض التوصيل، ويظهر لصاحب المتجر أثناء المهمة المسندة إليك.</small>
    {location.message && <p role="status">{location.message}</p>}
  </div>;
}
