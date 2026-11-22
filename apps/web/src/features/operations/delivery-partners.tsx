import { useState } from 'react';
import { api, json } from '../../shared/api/client';
import { usePolling } from '../../shared/hooks/use-polling';
import { useResource } from '../../shared/hooks/use-resource';
import { Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { orderLabels } from '../orders/status-labels';

type Company = { id: number; name: string };
type Partner = Company & { contract: 'PENDING' | 'CONFIRMED' | null };
type Queue = {
  company: Company;
  orders: { id: number; storeName: string; status: string; version: number }[];
  drivers: { userId: number; name: string }[];
  requests: { storeId: number; name: string }[];
};

export function StoreDeliveryPartners({ storeId }: { storeId: number }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>شركات التوصيل</summary>
    {open && <StorePartnerList storeId={storeId} />}
  </details>;
}

function StorePartnerList({ storeId }: { storeId: number }) {
  const state = useResource(signal => api<Partner[]>(`/stores/${storeId}/delivery-partners`, { signal }), `delivery-partners:${storeId}`);
  usePolling(state.reload, 10_000);
  return <Result state={state}>{companies => companies.length ? <ul className="stack">
    {companies.map(company => <li key={company.id}>
      <strong>{company.name}</strong>
      {company.contract === 'CONFIRMED' ? <p>متاحة للاختيار عند قبول الطلب.</p>
        : company.contract === 'PENDING' ? <p>بانتظار موافقة الشركة.</p>
          : <ActionForm label="طلب التعاقد" submit={async () => {
            await api(`/stores/${storeId}/delivery-contracts/${company.id}/request`, { method: 'PUT' });
            state.reload();
          }} />}
    </li>)}
  </ul> : <p>لا توجد شركات توصيل مسجلة حاليًا.</p>}</Result>;
}

export function DeliveryCompanyQueue() {
  const state = useResource(signal => api<Queue | null>('/delivery-companies/me/queue', { signal }), 'delivery-company-queue');
  usePolling(state.reload, 10_000, !!state.data);
  const queue = state.data;
  if (!queue?.company) return null;
  return <section className="surface padded stack">
    <h2>لوحة التوصيل لشركة {queue.company.name}</h2>
    <button type="button" className="secondary" onClick={state.reload}>تحديث الطلبات والتعاقدات</button>
    {!!queue.requests.length && <div className="stack">
      <h3>طلبات التعاقد</h3>
      {queue.requests.map(store => <ActionForm key={store.storeId} label="قبول التعاقد" submit={async () => {
        await api(`/stores/${store.storeId}/delivery-contracts/${queue.company.id}/confirm`, { method: 'PUT' });
        state.reload();
      }}><strong>{store.name}</strong></ActionForm>)}
    </div>}
    <h3>طلبات تحتاج إلى سائق</h3>
    {!queue.orders.length && <p>لا توجد طلبات بانتظار الإسناد.</p>}
    {!!queue.orders.length && !queue.drivers.length && <p>لا يوجد سائق متاح من فريق الشركة حاليًا.</p>}
    {queue.orders.map(order => <article className="surface padded stack" key={order.id}>
      <strong>طلب #{order.id} · {order.storeName}</strong>
      <p>{orderLabels[order.status]}</p>
      {!!queue.drivers.length && <ActionForm label="إسناد الطلب إلى السائق" submit={async fields => {
        await api(`/orders/${order.id}/status`, json('PATCH', {
          action: 'company_assign', version: order.version, driverId: Number(fields.get('driverId')),
        }));
        state.reload();
      }}>
        <label>سائق الشركة
          <select name="driverId" required defaultValue="">
            <option value="" disabled>اختر سائقًا</option>
            {queue.drivers.map(driver => <option value={driver.userId} key={driver.userId}>{driver.name}</option>)}
          </select>
        </label>
      </ActionForm>}
    </article>)}
  </section>;
}

export function DeliveryCompanyAdmin() {
  const [open, setOpen] = useState(false);
  return <details className="surface padded" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>إدارة شركات التوصيل</summary>
    {open && <DeliveryCompanySettings />}
  </details>;
}

function DeliveryCompanySettings() {
  const state = useResource(signal => api<(Company & { managerId: number })[]>('/delivery-companies', { signal }), 'delivery-companies');
  const [message, setMessage] = useState('');
  return <div className="stack">
    <ActionForm label="تسجيل شركة توصيل" submit={async fields => {
      await api('/delivery-companies', json('POST', { name: fields.get('name'), managerId: Number(fields.get('managerId')) }));
      state.reload();
      setMessage('تم تسجيل الشركة.');
    }}>
      <Field label="اسم شركة التوصيل" name="name" maxLength={160} />
      <Field label="رقم حساب مسؤول الشركة (حساب أعمال موثّق)" name="managerId" type="number" min={1} />
    </ActionForm>
    <Result state={state}>{companies => companies.length ? <>
      <ul>{companies.map(company => <li key={company.id}>{company.name} · مسؤول الشركة #{company.managerId}</li>)}</ul>
      <ActionForm label="حفظ تبعية السائق" submit={async fields => {
        const selection = fields.get('deliveryCompanyId');
        await api(`/drivers/${Number(fields.get('driverId'))}/delivery-company`, json('PUT', {
          deliveryCompanyId: selection ? Number(selection) : null,
        }));
        setMessage('تم حفظ تبعية السائق.');
      }}>
        <Field label="رقم حساب السائق المعتمد" name="driverId" type="number" min={1} />
        <label>يعمل السائق مع
          <select name="deliveryCompanyId">
            <option value="">سائق مستقل</option>
            {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
      </ActionForm>
    </> : <p>لا توجد شركات مسجلة بعد.</p>}</Result>
    {message && <p role="status">{message}</p>}
  </div>;
}
