import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { ArrowRight, Building2, Check, House, MapPin, BriefcaseBusiness, Trash2 } from 'lucide-react';
import { useIdentity } from '../../shared/auth/identity';
import { ApiError, api } from '../../shared/api/client';
import { normalizeDigits } from '../../shared/lib/numbers';
import { ActionForm } from '../../shared/ui/form';
import { ErrorBox } from '../../shared/ui/feedback';
import { AddressMap } from './address-map';
import { saveAddress, type Address } from './address-api';
import type { MapPoint } from '../../shared/lib/google-maps';
import './addresses.css';

const kinds = [
  { value: 'APARTMENT', label: 'شقة', icon: Building2 },
  { value: 'HOUSE', label: 'منزل', icon: House },
  { value: 'OFFICE', label: 'مكتب', icon: BriefcaseBusiness },
] as const;

export function AddressEditor({ address, createNew = false, onSaved, onCancel }: {
  address?: Address;
  createNew?: boolean;
  onSaved: (address?: Address) => Promise<void>;
  onCancel?: () => void;
}) {
  const { profile } = useIdentity();
  const [point, setPoint] = useState<MapPoint | undefined>(() => {
    if (address && Number.isFinite(Number(address.latitude)) && Number.isFinite(Number(address.longitude))) {
      return { lat: Number(address.latitude), lng: Number(address.longitude) };
    }
  });
  const [area, setArea] = useState(address?.area ?? '');
  const [street, setStreet] = useState(address?.street ?? '');
  const [building, setBuilding] = useState(address?.building ?? address?.address ?? '');
  const [floor, setFloor] = useState(address?.floor ?? '');
  const [directions, setDirections] = useState(address?.directions ?? '');
  const [label, setLabel] = useState(address?.label ?? '');
  const [kind, setKind] = useState<Address['residenceType']>(address?.residenceType ?? 'HOUSE');
  const initialPhone = address?.phone ?? (profile?.phone?.startsWith('g_') ? '' : profile?.phone ?? '');
  const [prefix, setPrefix] = useState(() => initialPhone.startsWith('+20') ? '+20' : initialPhone.startsWith('+972') ? '+972' : '+970');
  const [phone, setPhone] = useState(initialPhone.replace(/^\+(970|972|20)/, '').replace(/^0/, ''));
  const [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleting) dialog.current?.showModal();
  }, [deleting]);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();
  const [locationError, setLocationError] = useState(false);
  const type = kinds.find(item => item.value === kind)!;

  return (
    <div className="address-editor">
      <header className="address-editor-heading">
        {onCancel && <button type="button" className="address-back" aria-label="العودة" onClick={onCancel}><ArrowRight size={21} /></button>}
        <h1>{address ? 'تعديل العنوان' : 'إضافة عنوانك'}</h1>
        {address && <button type="button" className="address-delete" onClick={() => setDeleting(true)}><Trash2 size={16} />حذف</button>}
      </header>
      <AddressMap point={point} onChange={value => { setPoint(value); setLocationError(false); }} onArea={(nextArea, nextStreet) => {
        if (nextArea) setArea(nextArea.slice(0, 120));
        if (nextStreet) setStreet(nextStreet.slice(0, 160));
      }} />
      <ActionForm label={address ? 'حفظ التعديلات' : 'حفظ العنوان'} submit={async () => {
        if (!point) {
          setLocationError(true);
          throw new ApiError(400, 'حدّد الموقع من الخريطة أو عبر موقعي الحالي أو بإدخال الإحداثيات يدويًا قبل الحفظ.');
        }
        const fullAddress = [area.trim(), street.trim(), building.trim(), floor.trim() && `الطابق ${floor.trim()}`].filter(Boolean).join('، ');
        if (fullAddress.length > 500) throw new ApiError(400, 'تفاصيل العنوان طويلة. اختصر وصف المبنى أو الشارع.');
        const saved = await saveAddress({
          label: label.trim() || type.label,
          address: fullAddress, latitude: point.lat, longitude: point.lng,
          area: area.trim(), residenceType: kind, building: building.trim(), floor: floor.trim(),
          street: street.trim(), phone: prefix + normalizeDigits(phone).replace(/^0/, ''), directions: directions.trim(),
        }, address?.id, createNew);
        await onSaved(saved);
      }}>
        {locationError && <p className="address-inline-error" role="alert">اختر موقع التوصيل للمتابعة.</p>}
        <div className="address-area">
          <MapPin size={22} aria-hidden="true" />
          <label>المنطقة<input name="area" value={area} onChange={event => setArea(event.target.value)} required maxLength={120} placeholder="المدينة، الحي" autoComplete="address-level2" /></label>
          <button type="button" onClick={() => { const search = document.getElementById('address-map-search'); if (search) search.focus(); else document.querySelector<HTMLInputElement>('input[name="area"]')?.focus(); }}>تغيير</button>
        </div>
        <fieldset className="address-kind">
          <legend className="sr-only">نوع العنوان</legend>
          {kinds.map(item => <label key={item.value} className={kind === item.value ? 'is-selected' : ''}>
            <input type="radio" name="residenceType" value={item.value} checked={kind === item.value} onChange={() => setKind(item.value)} />
            <item.icon size={19} /><span>{item.label}</span>
          </label>)}
        </fieldset>
        <AddressField label={kind === 'APARTMENT' ? 'المبنى ورقم الشقة' : kind === 'OFFICE' ? 'المبنى واسم المكتب' : 'المبنى أو المنزل'} name="building" value={building} onChange={event => setBuilding(event.target.value)} maxLength={160} placeholder="اسم المبنى، رقم البوابة" autoComplete="address-line2" required />
        <AddressField label="الطابق (اختياري)" name="floor" value={floor} onChange={event => setFloor(event.target.value)} maxLength={40} placeholder="مثال: الطابق الثاني" />
        <AddressField label="الشارع" name="street" value={street} onChange={event => setStreet(event.target.value)} maxLength={160} placeholder="اسم الشارع" autoComplete="address-line1" required />
        <div className="address-phone">
          <label className="address-phone-prefix"><span className="sr-only">مفتاح الدولة</span>
            <select aria-label="مفتاح الدولة" value={prefix} onChange={event => setPrefix(event.target.value)}>
              <option value="+970">🇵🇸 +970</option><option value="+972">+972</option><option value="+20">🇪🇬 +20</option>
            </select>
          </label>
          <label>رقم التواصل<input name="phone" type="tel" value={phone} onChange={event => setPhone(normalizeDigits(event.target.value).replace(/[^0-9]/g, ''))} required minLength={7} maxLength={11} autoComplete="tel-national" placeholder="59 123 4567" /></label>
          {phone.length >= 7 && <Check size={17} className="address-check" aria-hidden="true" />}
        </div>
        <AddressField label="تعليمات إضافية (اختياري)" name="directions" value={directions} onChange={event => setDirections(event.target.value)} maxLength={300} placeholder="علامة مميزة تساعد المندوب على الوصول" />
        <AddressField label="اسم العنوان (اختياري)" name="label" value={label} onChange={event => setLabel(event.target.value)} maxLength={80} placeholder="مثال: بيتي، منزل العائلة" />
        <p className="address-form-hint">يُحفظ العنوان في حسابك لاستخدامه في طلباتك القادمة. يمكنك تعديله في أي وقت.</p>
      </ActionForm>
      {deleting && <dialog ref={dialog} className="address-dialog" onCancel={event => { if (deletePending) event.preventDefault(); else setDeleting(false); }} aria-labelledby="delete-address-title">
          <h2 id="delete-address-title">حذف العنوان المحفوظ؟</h2>
          <p>ستحتاج إلى حفظ عنوان توصيل عند طلبك القادم.</p>
          {deleteError ? <ErrorBox error={deleteError} /> : null}
          <div><button type="button" disabled={deletePending} onClick={() => { setDeleting(false); setDeleteError(undefined); }}>الاحتفاظ بالعنوان</button>
            <button type="button" className="address-delete" disabled={deletePending} onClick={() => {
              if (!address) return;
              setDeletePending(true);
              void api(`/addresses/${address.id}`, { method: 'DELETE' }).then(() => onSaved()).catch(setDeleteError).finally(() => setDeletePending(false));
            }}>{deletePending ? 'جارٍ الحذف…' : 'حذف العنوان'}</button></div>
      </dialog>}
    </div>
  );
}

function AddressField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="address-field"><span>{label}</span><input {...props} />{typeof props.value === 'string' && props.value.trim() && <Check size={17} className="address-check" aria-hidden="true" />}</label>;
}
