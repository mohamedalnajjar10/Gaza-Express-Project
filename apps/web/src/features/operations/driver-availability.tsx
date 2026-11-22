import { api, json } from '../../shared/api/client';
import { ActionForm } from '../../shared/ui/form';
import { Result } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';
import { DriverLocationControl } from './driver-location';
import { deliveryAreas } from '../../shared/lib/delivery-areas';
export default function Availability() {
  const state = useResource(signal => api<{ approved: boolean; available: boolean; dispatchAreaId?: number | null }>('/drivers/me/availability', { signal }), 'driver-availability');
  return <section className="surface padded narrow"><h2>التوفر للتوصيل</h2><Result state={state}>{value => value.approved ? <>
    <p role="status">{value.available ? 'أنت متاح للتوصيل' : 'أنت غير متاح للتوصيل'}</p>
    <ActionForm key={String(value.available)} label="حفظ حالة التوفر" submit={async fields => { await api('/drivers/me/availability', json('PATCH', {
      available: fields.get('available') === 'true', dispatchAreaId: dispatchArea(fields),
    })); state.reload(); }}>
      <label>حالة التوفر<select name="available" defaultValue={String(value.available)}><option value="true">متاح</option><option value="false">غير متاح</option></select></label>
      <AreaField value={value.dispatchAreaId} />
    </ActionForm>
    <DriverLocationControl />
    </> : <p>بانتظار اعتماد حساب السائق من الإدارة.</p>}</Result></section>;
}

export function DriverAreaPicker({ onSaved }: { onSaved: () => void }) {
  const state = useResource(signal => api<{ approved: boolean; dispatchAreaId?: number | null }>('/drivers/me/availability', { signal }), 'driver-dispatch-area');
  if (!state.data?.approved) return null;
  return <ActionForm label="حفظ منطقة التوصيل" submit={async fields => {
    await api('/drivers/me/availability', json('PATCH', { dispatchAreaId: dispatchArea(fields) }));
    state.reload();
    onSaved();
  }}>
    <AreaField value={state.data.dispatchAreaId} />
  </ActionForm>;
}

function dispatchArea(fields: FormData) {
  const value = fields.get('dispatchAreaId');
  return value ? Number(value) : null;
}

function AreaField({ value }: { value?: number | null }) {
  return <label>منطقة التوصيل عند تعذّر الموقع
    <select name="dispatchAreaId" defaultValue={value ?? ''} key={value ?? ''}>
      <option value="">بدون منطقة بديلة</option>
      {deliveryAreas.map(area => <option key={area.id} value={area.id}>{area.id === 1 ? 'غزة (مثل الرمال وتل الهوى)' : area.name}</option>)}
    </select>
    <small>تظهر عروض المتاجر في المنطقة عند غياب موقع GPS حديث.</small>
  </label>;
}
