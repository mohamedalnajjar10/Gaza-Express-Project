import { useEffect, useRef, useState } from 'react';
import { api } from '../../shared/api/client';
import { usePolling } from '../../shared/hooks/use-polling';
import { useResource } from '../../shared/hooks/use-resource';
import { Result } from '../../shared/ui/feedback';
import { loadGoogleMaps, type MapPoint } from '../../shared/lib/google-maps';
import './dispatch.css';

type Position = { latitude: number; longitude: number; updatedAt: string };
type Tracking = { driver: { name: string; phone: string; location: Position | null } | null };

export function DriverTracking({ id }: { id: number }) {
  const state = useResource(signal => api<Tracking>(`/orders/${id}/driver-tracking`, { signal }), `tracking:${id}`);
  usePolling(state.reload, 10_000);
  return <section className="surface padded stack">
    <h2>السائق المكلّف بالتوصيل</h2>
    <Result state={state}>{({ driver }) => driver ? <>
      <strong>{driver.name}</strong>
      <a href={`tel:${driver.phone}`} dir="ltr">{driver.phone}</a>
      {driver.location
        ? <DriverMap location={driver.location} />
        : <p>لا يتوفر موقع حديث للسائق. سيظهر هنا عندما يشارك موقعه.</p>}
    </> : <p>بانتظار إسناد الطلب إلى سائق.</p>}</Result>
  </section>;
}

function DriverMap({ location }: { location: Position }) {
  const canvas = useRef<HTMLDivElement>(null);
  const point = useRef<MapPoint>({ lat: location.latitude, lng: location.longitude });
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unavailable = () => { if (mounted) setFailed(true); };
    window.addEventListener('google-maps-auth-failure', unavailable);
    void loadGoogleMaps().then(() => {
      if (!mounted || !canvas.current) return;
      map.current = new google.maps.Map(canvas.current, {
        center: point.current, zoom: 15, streetViewControl: false, mapTypeControl: false,
      });
      marker.current = new google.maps.Marker({ position: point.current, map: map.current, title: 'موقع السائق' });
    }).catch(unavailable);
    return () => {
      mounted = false;
      marker.current?.setMap(null);
      marker.current = null;
      map.current = null;
      window.removeEventListener('google-maps-auth-failure', unavailable);
    };
  }, []);

  useEffect(() => {
    point.current = { lat: location.latitude, lng: location.longitude };
    marker.current?.setPosition(point.current);
    map.current?.panTo(point.current);
  }, [location.latitude, location.longitude]);

  const coordinates = `${location.latitude},${location.longitude}`;
  return <>
    <div ref={canvas} className="driver-tracking-map" aria-label="خريطة موقع السائق" hidden={failed} />
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`} target="_blank" rel="noopener noreferrer">
      فتح موقع السائق في الخرائط
    </a>
    <small>آخر تحديث {new Date(location.updatedAt).toLocaleTimeString('ar-PS')}</small>
  </>;
}
