import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../shared/api/client';
import { type Order } from './types';
import { OrderActions } from './order-actions';
import { orderLabels } from './status-labels';
import { useIdentity } from '../../shared/auth/identity';
import { money } from '../../shared/lib/money';
import { Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

export default function OrderDetail() {
  const { id } = useParams();
  const state = useResource(
    signal => api<Order>(`/orders/${id}`, { signal }),
    `order:${id}`,
  );
  const { profile } = useIdentity();
  return (
    <Result state={state}>
      {order => (
        <>
          <Link to="/orders">العودة للطلبات</Link>
          <Title label={`طلب #${id}`} detail={order.storeName} />
          <div className="split">
            <section className="surface padded">
              <span className="badge">
                {orderLabels[order.status] || order.status}
              </span>
              <h2>تفاصيل الطلب</h2>
              {order.itemSnapshots?.map((i, index) => (
                <p key={index}>
                  {i.nameAr} × {i.quantity}
                </p>
              ))}
              <strong>
                {money(
                  order.finalTotal ?? order.proposedTotal ?? order.estimatedMin,
                  order.currency,
                )}
              </strong>
              {order.events?.length ? (
                <ol className="timeline">
                  {order.events.map(event => (
                    <li key={event.id}>
                      {orderLabels[event.toStatus] ?? event.toStatus}
                      <small>
                        {new Date(event.createdAt).toLocaleString('ar-PS')}
                      </small>
                    </li>
                  ))}
                </ol>
              ) : null}
              <button className="secondary" onClick={state.reload}>
                تحديث حالة الطلب
              </button>
            </section>
            <div className="stack">
              {profile && (
                <OrderActions
                  order={order}
                  profile={profile}
                  reload={state.reload}
                />
              )}{' '}
              {profile?.role === 'customer' &&
                order.status === 'IN_TRANSIT' && (
                  <DeliveryCode id={order.id} />
                )}{' '}
              {order.paymentMethod === 'BANK_TRANSFER' &&
                profile?.role === 'customer' && <BankPayment id={order.id} />}
            </div>
          </div>
        </>
      )}
    </Result>
  );
}
function DeliveryCode({ id }: { id: number }) {
  const [code, setCode] = useState('');
  return (
    <div className="surface padded">
      <h2>رمز التسليم</h2>
      <p>أعطِ الرمز للسائق عند استلام الطلب.</p>
      <ActionForm
        label="عرض الرمز"
        submit={async () =>
          setCode(
            (await api<{ code: string }>(`/orders/${id}/delivery-code`)).code,
          )
        }
      />
      {code && (
        <output className="delivery-code" dir="ltr">
          {code}
        </output>
      )}
    </div>
  );
}
function BankPayment({ id }: { id: number }) {
  const state = useResource(
    signal =>
      api<{
        status: string;
        bankInstructions?: string;
        whatsappText?: string;
        whatsappReceived?: boolean;
      }>(`/orders/${id}/payment`, { signal }).catch(e => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    `payment:${id}`,
  );
  return (
    <Result state={state}>
      {value =>
        value ? (
          <div className="surface padded">
            <h2>التحويل البنكي</h2>
            <p>
              {value.status === 'PAID'
                ? 'تم تأكيد الدفع'
                : value.whatsappReceived
                  ? 'وصل الإشعار، بانتظار مطابقة البنك'
                  : 'بانتظار التحويل والتحقق'}
            </p>
            {value.bankInstructions && <p>{value.bankInstructions}</p>}
            {value.whatsappText && <p dir="ltr">{value.whatsappText}</p>}
            <button className="secondary" onClick={state.reload}>
              تحديث حالة الدفع
            </button>
          </div>
        ) : null
      }
    </Result>
  );
}
