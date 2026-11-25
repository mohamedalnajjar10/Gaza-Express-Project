import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { loadGoogleMaps, roundPoint, type MapPoint } from '../../shared/lib/google-maps';
import { normalizeDigits } from '../../shared/lib/numbers';

function parseCoordinate(value: string, limit: number) {
  const normalized = normalizeDigits(value.trim())
    .replace(/[٫,]/g, '.')
    .replace(/−/g, '-');
  if (!/^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(normalized)) return undefined;
  const number = Number(normalized);
  if (Math.abs(number) <= limit) return number;
}

export function AddressMap({ point, onChange, onArea }: {
  point?: MapPoint;
  onChange: (point: MapPoint) => void;
  onArea: (area: string, street: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | undefined>(undefined);
  const geocoder = useRef<google.maps.Geocoder | undefined>(undefined);
  const sequence = useRef(0);
  const skipNextPan = useRef(false);
  const latest = useRef({ onChange, onArea });
  latest.current = { onChange, onArea };
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [locating, setLocating] = useState(false);
  const initial = useRef(point ?? { lat: 31.5017, lng: 34.4668 });

  async function choose(next: MapPoint, lookupAddress = true) {
    const id = ++sequence.current;
    latest.current.onChange(roundPoint(next));
    if (!lookupAddress || !geocoder.current) return;
    try {
      const { results } = await geocoder.current.geocode({ location: next });
      if (id !== sequence.current) return;
      const parts = results[0]?.address_components ?? [];
      const name = (type: string) => parts.find(part => part.types.includes(type))?.long_name;
      latest.current.onArea(name('sublocality_level_1') ?? name('neighborhood') ?? name('locality') ?? '', name('route') ?? '');
    } catch {
      if (id === sequence.current) setMessage('تم تحديد الموقع. اكتب المنطقة والشارع لتسهيل الوصول.');
    }
  }

  useEffect(() => {
    const requestSequence = sequence;
    let active = true;
    const listeners: google.maps.MapsEventListener[] = [];
    const failed = () => { if (active) { setReady(false); setUnavailable(true); } };
    window.addEventListener('google-maps-auth-failure', failed);
    void loadGoogleMaps().then(() => {
      if (!active || !canvas.current) return;
      const instance = new google.maps.Map(canvas.current, {
        center: initial.current, zoom: 16, mapTypeControl: false, streetViewControl: false,
        fullscreenControl: false, clickableIcons: false, gestureHandling: 'cooperative',
      });
      map.current = instance;
      geocoder.current = new google.maps.Geocoder();
      listeners.push(instance.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) {
          instance.panTo(event.latLng);
          void choose(event.latLng.toJSON());
        }
      }));
      listeners.push(instance.addListener('dragend', () => {
        const center = instance.getCenter();
        if (center) {
          skipNextPan.current = true;
          void choose(center.toJSON());
        }
      }));
      setReady(true);
    }).catch(failed);
    return () => {
      active = false;
      requestSequence.current++;
      listeners.forEach(listener => listener.remove());
      map.current = undefined;
      window.removeEventListener('google-maps-auth-failure', failed);
    };
  }, []);

  const latitude = point?.lat;
  const longitude = point?.lng;
  useEffect(() => {
    if (skipNextPan.current) {
      skipNextPan.current = false;
      return;
    }
    if (latitude !== undefined && longitude !== undefined) map.current?.panTo({ lat: latitude, lng: longitude });
  }, [latitude, longitude, ready]);

  function locate() {
    if (!navigator.geolocation) { setMessage('تحديد الموقع غير مدعوم في هذا المتصفح. اختر موقعك من الخريطة أو أدخل الإحداثيات يدويًا.'); return; }
    setLocating(true);
    setMessage('');
    const attempt = ++sequence.current;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (attempt !== sequence.current) return;
        void choose({ lat: coords.latitude, lng: coords.longitude });
        setMessage('تم تحديد موقعك الحالي. تأكد من تفاصيل الوصول أدناه.');
      },
      () => {
        setLocating(false);
        if (attempt === sequence.current) setMessage('تعذّر تحديد الموقع. اختره من الخريطة أو أدخل الإحداثيات يدويًا.');
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  }

  return (
    <section className="address-map-section" aria-label="اختيار الموقع على الخريطة">
      <div className="address-map-viewport">
        <div className="address-map-canvas" ref={canvas} aria-label="خريطة Google لتحديد العنوان" />
        {ready && <span className="address-map-pin" aria-hidden="true"><MapPin size={46} fill="currentColor" strokeWidth={1.7} /></span>}
        {!ready && <div className="address-map-unavailable">
          <MapPin size={32} aria-hidden="true" />
          <strong>{unavailable ? 'الخريطة غير متاحة حالياً' : 'جارٍ تحميل الخريطة…'}</strong>
          <p>{unavailable ? 'استخدم موقعك الحالي أو أدخل الإحداثيات يدويًا.' : 'اختر موقعك بدقة لتسهيل التوصيل.'}</p>
        </div>}
        <button type="button" className="address-locate" onClick={locate} disabled={locating}>
          <LocateFixed size={18} aria-hidden="true" />{locating ? 'جارٍ تحديد الموقع…' : 'موقعي الحالي'}
        </button>
        {ready && <div className="address-map-search">
          <label className="sr-only" htmlFor="address-map-search">البحث عن منطقة على الخريطة</label>
          <input id="address-map-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث عن منطقة أو شارع" maxLength={150}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void searchMap(); } }} />
          <button type="button" aria-label="بحث في الخريطة" onClick={() => void searchMap()}><Search size={18} aria-hidden="true" /></button>
        </div>}
      </div>
      <div className="address-map-caption"><span>{point ? 'تم تحديد الموقع' : unavailable ? 'حدّد موقع التوصيل قبل حفظ العنوان' : 'حرّك الخريطة أو اضغط عليها لتحديد الموقع'}</span>{message && <p role="status">{message}</p>}</div>
      <ManualCoordinates key={point ? `${point.lat},${point.lng}` : ''} point={point} onApply={next => {
        setMessage('');
        void choose(next, false);
      }} />
    </section>
  );

  async function searchMap() {
    if (!search.trim() || !geocoder.current) return;
    const id = ++sequence.current;
    try {
      const { results } = await geocoder.current.geocode({ address: search.trim() });
      if (id !== sequence.current) return;
      const result = results[0];
      if (!result) { setMessage('لم نعثر على المنطقة. جرّب اسم المدينة والشارع.'); return; }
      map.current?.panTo(result.geometry.location);
      map.current?.setZoom(17);
      await choose(result.geometry.location.toJSON());
    } catch {
      setMessage('تعذّر البحث حالياً. يمكنك اختيار الموقع من الخريطة.');
    }
  }
}

function ManualCoordinates({ point, onApply }: { point?: MapPoint; onApply: (point: MapPoint) => void }) {
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  return <details className="address-map-caption" open={open} onToggle={event => {
    setOpen(event.currentTarget.open);
    if (!event.currentTarget.open) setInvalid(false);
  }}>
    <summary>إدخال الإحداثيات يدويًا</summary>
    {open && <form className="form" onSubmit={event => {
      event.preventDefault();
      const coordinates = new FormData(event.currentTarget);
      const lat = parseCoordinate(String(coordinates.get('latitude') ?? ''), 90);
      const lng = parseCoordinate(String(coordinates.get('longitude') ?? ''), 180);
      if (lat === undefined || lng === undefined) {
        setInvalid(true);
        return;
      }
      onApply({ lat, lng });
      setInvalid(false);
      setOpen(false);
    }}>
      <p>انسخ خط العرض وخط الطول من تطبيق الخرائط، ثم اضغط «استخدام الإحداثيات» قبل حفظ العنوان.</p>
      <label>خط العرض<input name="latitude" dir="ltr" inputMode="decimal" maxLength={32} defaultValue={point?.lat} required /></label>
      <label>خط الطول<input name="longitude" dir="ltr" inputMode="decimal" maxLength={32} defaultValue={point?.lng} required /></label>
      {invalid && <p className="address-inline-error" role="alert">أدخل خط عرض بين ‎−90 و90 وخط طول بين ‎−180 و180.</p>}
      <button type="submit" className="secondary">استخدام الإحداثيات</button>
    </form>}
  </details>;
}
