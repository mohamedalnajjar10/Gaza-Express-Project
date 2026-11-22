import { api, json } from '../../shared/api/client';
import { type Order } from './types';
import { type Profile } from '../../shared/auth/types';
import { money } from '../../shared/lib/money';
import { ActionForm, Field } from '../../shared/ui/form';
import { Result } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';

export function OrderActions({
  order,
  profile,
  reload,
}: {
  order: Order;
  profile: Profile;
  reload: () => void;
}) {
  const { status, id, version } = order;
  const { role, user_id } = profile;
  const quote = status === 'PENDING' || status === 'QUOTED';
  const cancel = [
    'PENDING',
    'QUOTED',
    'ACCEPTED',
    'READY',
    'ASSIGNED',
  ].includes(status);
  const activeOffer =
    order.offerExpiresAt &&
    new Date(order.offerExpiresAt).getTime() > Date.now();
  const submit =
    (action: string, numeric?: string) => async (data: FormData) => {
      const fields = Object.fromEntries(data.entries());
      const { deliveryCompanyId, ...actionFields } = fields;
      await api(
        `/orders/${id}/status`,
        json('PATCH', {
          ...actionFields,
          ...(deliveryCompanyId !== undefined && { deliveryCompanyId: deliveryCompanyId ? Number(deliveryCompanyId) : null }),
          ...(numeric && { [numeric]: Number(fields[numeric]) }),
          action,
          version,
        }),
      );
      reload();
    };
  const reason = <Field label="السبب" name="reason" maxLength={500} />;
  const company = order.deliveryCompanies && (order.deliveryCompanies.length > 0 || order.deliveryCompanyId != null) && (
    <label>
      طريقة التوصيل
      <select name="deliveryCompanyId" defaultValue={order.deliveryCompanyAvailable === false ? '' : order.deliveryCompanyId ?? ''} key={`${order.version}:${order.deliveryCompanyAvailable}`}>
        <option value="">سائق مستقل</option>
        {order.deliveryCompanies.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
      </select>
    </label>
  );
  return (
    <div className="stack order-actions">
      {role === 'customer' && status === 'QUOTED' && (order.deliveryCompanyAvailable === false
        ? <p role="status">شركة التوصيل المحددة غير متاحة حاليًا. بانتظار عرض محدّث من المتجر.</p>
        : <ActionForm
          label="الموافقة على السعر"
          submit={submit('approve_quote')}
        />
      )}
      {role === 'store_owner' && (
        <>
          {quote && order.deliveryCompanyAvailable === false && <p role="status">شركة التوصيل المحددة غير متاحة. اختر طريقة توصيل متاحة وأرسل العرض مجددًا.</p>}
          {status === 'PENDING' && !order.requiresQuote && (
            <ActionForm label="قبول الطلب" submit={submit('accept')}>{company}</ActionForm>
          )}
          {quote && (
            <ActionForm
              label="إرسال عرض السعر"
              submit={submit('quote', 'total')}
            >
              <Field
                label="الإجمالي المقترح"
                name="total"
                type="number"
                min={0}
                step="0.01"
              />
              {company}
            </ActionForm>
          )}
          {quote && (
            <details className="surface padded">
              <summary>رفض الطلب</summary>
              <ActionForm label="تأكيد الرفض" submit={submit('reject')}>
                {reason}
              </ActionForm>
            </details>
          )}
          {status === 'ACCEPTED' && (order.paymentMethod === 'CASH' || order.payment?.status === 'PAID'
            ? <ActionForm label="الطلب جاهز للاستلام" submit={submit('ready')} />
            : <p>بانتظار تأكيد الدفع قبل تسليم الطلب للسائق.</p>)}
        </>
      )}
      {role === 'admin' && (
        <>
          {(status === 'ACCEPTED' || status === 'READY') && order.deliveryCompanyId != null && order.driverId == null && (
            <ActionForm label="تحويل الطلب إلى سائق مستقل" submit={submit('reroute_delivery')}>{reason}</ActionForm>
          )}
          {status === 'READY' && !activeOffer && !order.deliveryCompanyId && (
            <ActionForm
              label="عرض الطلب على السائق"
              submit={submit('assign', 'driverId')}
            >
              <Field
                label="رقم حساب السائق"
                name="driverId"
                type="number"
                min={1}
              />
            </ActionForm>
          )}
          {status === 'IN_TRANSIT' && (
            <details className="surface padded">
              <summary>إجراءات تعذّر التسليم</summary>
              <ActionForm label="تأكيد إرجاع الطلب إلى المتجر" submit={submit('confirm_return')}>
                {reason}
              </ActionForm>
              <ActionForm
                label="إصدار الرمز"
                submit={submit('reset_delivery_code')}
              >
                {reason}
              </ActionForm>
            </details>
          )}
        </>
      )}
      {role === 'driver' && (
        <>
          {order.openOffer?.canClaim && <ActionForm label="قبول مهمة التوصيل" submit={submit('claim_delivery')} />}
          {order.openOffer && !order.openOffer.canClaim && <p>الأولوية الآن للسائق الأقرب. يُفتح القبول لبقية السائقين بعد انتهاء الأولوية.</p>}
          {status === 'ACCEPTED' && order.driverId === user_id && <p>الطلب مسند إليك ويجري تحضيره. يمكنك تأكيد الاستلام عندما يحدده المتجر كجاهز.</p>}
          {status === 'READY' &&
            activeOffer &&
            order.offeredDriverId === user_id && (
              <>
                <ActionForm
                  label="قبول التوصيل"
                  submit={submit('accept_assignment')}
                />
                <ActionForm
                  label="رفض العرض"
                  submit={submit('decline_assignment')}
                />
              </>
            )}
          {status === 'ASSIGNED' && (
            <ActionForm
              label="استلمت الطلب من المتجر"
              submit={submit('pick_up')}
            />
          )}
          {status === 'IN_TRANSIT' && (
            <>
              <ActionForm
                label="تأكيد التسليم"
                submit={submit(
                  'deliver',
                  order.paymentMethod === 'CASH'
                    ? 'collectedAmount'
                    : undefined,
                )}
              >
                <Field
                  label="رمز العميل"
                  name="deliveryCode"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
                {order.paymentMethod === 'CASH' && (
                  <Field
                    label={`المبلغ المحصّل (${order.currency})`}
                    name="collectedAmount"
                    type="number"
                    min={0}
                    step="0.01"
                  />
                )}
              </ActionForm>
              <details className="surface padded">
                <summary>الإبلاغ عن مشكلة توصيل</summary>
                <ActionForm
                  label="إرسال البلاغ"
                  submit={submit('report_delivery_issue')}
                >
                  {reason}
                </ActionForm>
              </details>
            </>
          )}
        </>
      )}
      {role !== 'driver' && cancel && (
        <details className="surface padded">
          <summary>إلغاء الطلب</summary>
          <ActionForm label="تأكيد الإلغاء" submit={submit('cancel')}>
            {reason}
          </ActionForm>
        </details>
      )}
      {role === 'admin' &&
        !['PENDING', 'QUOTED', 'REJECTED'].includes(status) &&
        order.finalTotal != null && <Payment order={order} />}
    </div>
  );
}

type PaymentData = {
  method: string;
  status: string;
  amount: string;
  currency: string;
  whatsappReceivedAt?: string;
  entries: { id: number; kind: string; amount: string; reference?: string }[];
};

function Payment({ order }: { order: Order }) {
  const state = useResource(
    signal => api<PaymentData>(`/orders/${order.id}/payment`, { signal }),
    `admin-payment:${order.id}`,
  );
  return (
    <section className="surface padded">
      <h2>الدفع والمستحقات</h2>
      <Result state={state}>
        {payment => (
          <>
            <p>
              {money(payment.amount, payment.currency)} · {payment.status}
            </p>
            <ul>
              {payment.entries.map(entry => (
                <li key={entry.id}>
                  {entry.kind} · {money(entry.amount, payment.currency)}{' '}
                  {entry.reference}
                </li>
              ))}
            </ul>
            {payment.method === 'BANK_TRANSFER' &&
              ['DUE', 'VOID'].includes(payment.status) &&
              (payment.whatsappReceivedAt ? (
                <ActionForm
                  label="تأكيد المطابقة مع كشف البنك"
                  submit={async data => {
                    await api(
                      `/orders/${order.id}/payment/bank-reconciliation`,
                      json('POST', {
                        amount: Number(data.get('amount')),
                        currency: payment.currency,
                        reference: data.get('reference'),
                      }),
                    );
                    state.reload();
                  }}
                >
                  <Field
                    label="المبلغ في كشف البنك"
                    name="amount"
                    type="number"
                    min={0}
                    step="0.01"
                  />
                  <Field label="مرجع البنك" name="reference" maxLength={70} />
                </ActionForm>
              ) : (
                <p>بانتظار وصول إشعار واتساب.</p>
              ))}
            {payment.status === 'REFUND_REQUIRED' && (
              <ActionForm label="تسجيل رد المبلغ بعد تنفيذه" submit={async data => {
                await api(`/orders/${order.id}/payment/refund`, json('POST', {
                  amount: Number(data.get('amount')), currency: payment.currency, reference: data.get('reference'),
                }));
                state.reload();
              }}>
                <Field label="المبلغ المسترد" name="amount" type="number" min={0} step="0.01" />
                <Field label="مرجع الاسترداد" name="reference" maxLength={70} />
              </ActionForm>
            )}
            {order.status === 'DELIVERED' && (
              <ActionForm
                label="تسجيل التسوية"
                submit={async data => {
                  await api(
                    `/orders/${order.id}/settlements`,
                    json('POST', Object.fromEntries(data)),
                  );
                  state.reload();
                }}
              >
                <label>
                  نوع التسوية
                  <select name="kind">
                    {payment.method === 'CASH' && (
                      <option value="cash_handover">توريد النقد</option>
                    )}
                    <option value="store_payout">مستحقات المتجر</option>
                    <option value="driver_payout">مستحقات السائق</option>
                  </select>
                </label>
                <Field label="مرجع التسوية" name="reference" maxLength={100} />
              </ActionForm>
            )}
          </>
        )}
      </Result>
    </section>
  );
}
