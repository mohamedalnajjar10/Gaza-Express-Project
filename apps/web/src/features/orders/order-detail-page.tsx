import { BankPayment } from './bank-payment';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { type Order } from './types';
import { OrderActions } from './order-actions';
import { orderLabels } from './status-labels';
import { useIdentity } from '../../shared/auth/identity';
import { money } from '../../shared/lib/money';
import { Result, Title } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';
import { usePolling } from '../../shared/hooks/use-polling';
import { useOrderUpdates } from './use-order-updates';
import { DriverTracking } from './driver-tracking';
import { DriverLocationControl } from '../driver/driver-location';

const paymentLabels: Record<string, string> = {
  CASH: 'الدفع عند الاستلام', BANK_TRANSFER: 'تحويل بنكي', ELECTRONIC: 'دفع إلكتروني',
};

const eventActionLabels: Record<string, string> = {
  checkout: 'تم إرسال الطلب',
  accept: 'قبول المتجر للطلب',
  quote: 'إرسال عرض السعر',
  approve_quote: 'موافقة العميل على السعر',
  reject: 'رفض المتجر للطلب',
  cancel: 'إلغاء الطلب',
  ready: 'الطلب جاهز للاستلام',
  assign: 'عرض الطلب على سائق',
  accept_assignment: 'قبول السائق للتوصيل',
  decline_assignment: 'اعتذار السائق عن العرض',
  claim_delivery: 'استلام السائق لمهمة التوصيل',
  company_assign: 'إسناد الطلب لسائق شركة التوصيل',
  reroute_delivery: 'تحويل الطلب إلى التوصيل المستقل',
  pick_up: 'استلم السائق الطلب من المتجر',
  deliver: 'تم تسليم الطلب للعميل',
  report_delivery_issue: 'بلاغ عن مشكلة في التوصيل',
  reset_delivery_code: 'إصدار رمز تسليم جديد',
  confirm_return: 'تأكيد إرجاع الطلب إلى المتجر',
};

export default function OrderDetail() {
  const { id } = useParams();
  const { state: navigation } = useLocation();
  const state = useResource(
    signal => api<Order>(`/orders/${id}`, { signal }),
    `order:${id}`,
  );
  const { profile } = useIdentity();
  const active = !state.data || !['DELIVERED', 'REJECTED', 'CANCELLED'].includes(state.data.status);
  const connected = useOrderUpdates(state.reload, active);
  usePolling(state.reload, 8_000, active && (!connected || state.data?.openOffer?.canClaim === false));
  return (
    <Result state={state}>
      {order => (
        <>
          <Link to={order.companyView ? '/operations' : '/orders'}>{order.companyView ? 'العودة إلى لوحة الشركة' : 'العودة للطلبات'}</Link>
          <Title label={`طلب #${id}`} detail={order.storeName} />
          {profile?.role === 'customer' && order.status === 'ACCEPTED' && (order.paymentMethod === 'CASH' || order.payment?.status === 'PAID')
            ? <p className="surface padded" role="status">تم استلام طلبك بنجاح وجارٍ التحضير.</p>
            : profile?.role === 'customer' && navigation?.submitted && order.status === 'PENDING'
              ? <p className="surface padded" role="status">تم إرسال طلبك إلى المتجر بنجاح. بانتظار تأكيد المتجر.</p>
              : null}
          <div className="split">
            <section className="surface padded">
              <span className="badge">
                {profile?.role === 'customer' && order.status === 'ACCEPTED' && order.payment && order.paymentMethod !== 'CASH' && order.payment.status !== 'PAID'
                  ? 'بانتظار تأكيد الدفع'
                  : orderLabels[order.status] || order.status}
              </span>
              <h2>تفاصيل الطلب</h2>
              {order.openOffer && <p>
                {order.openOffer.nearby && <strong>{order.openOffer.pickupKm === null ? 'ضمن منطقة التوصيل.' : 'طلب قريب منك. '}</strong>}
                {order.openOffer.pickupKm !== null && <span>يبعد المتجر عنك نحو {order.openOffer.pickupKm} كم.</span>}
              </p>}
              {order.companyView && <p>يمكن اختيار السائق من قائمة الطلبات في لوحة شركة التوصيل.</p>}
              {profile?.role === 'store_owner' && !order.offerOnly && <>
                {order.customer && <p>العميل: {order.customer.full_name_ar || order.customer.full_name}</p>}
                <Location title="عنوان التوصيل" {...order.addressSnapshot} phone={order.addressSnapshot?.phone || order.customer?.phone} />
                <p>طريقة الدفع: {paymentLabels[order.paymentMethod] ?? order.paymentMethod}</p>
              </>}
              {(profile?.role === 'store_owner' || profile?.role === 'admin') && order.deliveryCompany &&
                <p>شركة التوصيل: {order.deliveryCompany.name}</p>}
              {!order.offerOnly && profile?.role === 'driver' && <>
                <Location title="موقع استلام الطلب" address={order.store?.fullAddressAr || order.store?.fullAddress} phone={order.store?.phone} latitude={order.store?.latitude} longitude={order.store?.longitude} />
                <Location title="عنوان التوصيل" {...order.addressSnapshot} />
              </>}
              {!order.offerOnly && order.events?.filter(event => event.action === 'checkout' && event.details?.note).map(event => (
                <p className="order-customer-note" key={event.id}>ملاحظة الطلب: {event.details?.note}</p>
              ))}
              {!order.offerOnly && order.itemSnapshots?.map((item, index) => (
                <div key={index}>
                  <p>{item.nameAr || item.nameEn} × {item.quantity}
                    {item.unitMin && <> · {money(item.unitMin, order.currency)}
                      {item.unitMax && item.unitMax !== item.unitMin && <> – {money(item.unitMax, order.currency)}</>}</>}
                  </p>
                  {!!item.options?.length && <small>{item.options.map(option => option.nameAr || option.name).join('، ')}</small>}
                </div>
              ))}
              {!order.offerOnly && <strong>
                {money(
                  order.finalTotal ?? order.proposedTotal ?? order.estimatedMin,
                  order.currency,
                )}
              </strong>}
              {(Number(order.deliveryFee ?? 0) > 0 || order.deliveryDistanceKm != null) && (
                <p>
                  رسوم التوصيل{order.deliveryDistanceKm ? ` (${order.deliveryDistanceKm} كم)` : ''}:{' '}
                  {Number(order.deliveryFee ?? 0) > 0 ? money(order.deliveryFee!, order.currency) : 'توصيل مجاني'}
                </p>
              )}
              {Number(order.rewardDiscount) > 0 && <p>خصم المكافآت: {money(order.rewardDiscount!, order.currency)}</p>}
              {!order.finalTotal && !!order.rewardDiscountRate && ['PENDING', 'QUOTED'].includes(order.status) && <p>سيُطبّق خصم المكافآت ({order.rewardDiscountRate}٪) على المنتجات بعد تأكيد السعر.</p>}
              {profile?.role === 'customer' && !order.offerOnly && order.rewardPointsEarned && !['CANCELLED', 'REJECTED'].includes(order.status) && (
                <small>
                  {order.status === 'DELIVERED'
                    ? `تمت إضافة ${order.rewardPointsEarned} نقطة ولاء لهذا الطلب.`
                    : `ستكسب ${order.rewardPointsEarned} نقطة ولاء${order.rewardPointsEarned > 10 ? ' (ضعف النقاط — بنك فلسطين)' : ''} عند التسليم.`}
                </small>
              )}
              {order.events?.length ? (
                <ol className="timeline">
                  {order.events.map(event => (
                    <li key={event.id}>
                      {(event.action && eventActionLabels[event.action]) ?? orderLabels[event.toStatus] ?? event.toStatus}
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
              {profile && !order.companyView && (
                <OrderActions
                  order={order}
                  profile={profile}
                  reload={state.reload}
                />
              )}{' '}
              {profile?.role === 'store_owner' && !order.companyView && ['ACCEPTED', 'READY', 'ASSIGNED', 'IN_TRANSIT'].includes(order.status) &&
                <DriverTracking id={order.id} />}
              {profile?.role === 'driver' && !order.offerOnly && ['ACCEPTED', 'ASSIGNED', 'IN_TRANSIT'].includes(order.status) &&
                <div className="surface padded"><DriverLocationControl /></div>}
              {profile?.role === 'customer' &&
                order.status === 'IN_TRANSIT' && (
                  <DeliveryCode id={order.id} />
                )}{' '}
              {order.paymentMethod === 'BANK_TRANSFER' &&
                profile && !order.companyView && ['customer','store_owner'].includes(profile.role) && (
                  <BankPayment
                    role={profile.role}
                    order={order}
                    key={`${order.id}:${order.version}:${order.status}:${order.payment?.status}`}
                    id={order.id}
                    onConfirmed={state.reload}
                  />
                )}
            </div>
          </div>
        </>
      )}
    </Result>
  );
}
function DeliveryCode({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);
  const codeState = useResource(
    signal => api<{ code: string }>(`/orders/${id}/delivery-code`, { signal }),
    `delivery-code:${id}`,
  );
  const code = codeState.data?.code ?? '';
  return (
    <div className="surface padded stack">
      <h2>رمز التسليم</h2>
      <p>أعطِ الرمز للسائق عند استلام الطلب.</p>
      {code && (
        <div className="bop-detail-row">
          <output className="delivery-code" dir="ltr">
            {code}
          </output>
          <button
            type="button"
            className="secondary copy-pill"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch { /* clipboard unavailable */ }
            }}
          >
            {copied ? <><Check size={14} aria-hidden="true" /> تم النسخ</> : <><Copy size={14} aria-hidden="true" /> نسخ الرمز</>}
          </button>
        </div>
      )}
      <button type="button" className="secondary" onClick={codeState.reload}>
        عرض الرمز
      </button>
    </div>
  );
}
function Location({ title, address, phone, directions, latitude, longitude, area, street, building, floor }: { title: string; address?: string | null; phone?: string | null; directions?: string | null; latitude?: string | number | null; longitude?: string | number | null; area?: string | null; street?: string | null; building?: string | null; floor?: string | null }) {
  const located = latitude != null && longitude != null && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const details = [area, street, building, floor && `الطابق ${floor}`].filter(Boolean).join('، ');
  return <section aria-label={title}><h3>{title}</h3><p>{address || 'تفاصيل الموقع غير متاحة. تواصل مع المتجر.'}</p>
    {details && <p>{details}</p>}
    {directions && <p>{directions}</p>}
    {phone && <p><a href={`tel:${phone}`} dir="ltr">{phone}</a></p>}
    {located && <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`} target="_blank" rel="noopener noreferrer">فتح الملاحة إلى {title}</a>}
  </section>;
}
