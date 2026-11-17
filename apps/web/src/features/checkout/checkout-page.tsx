import { useRewards } from '../account/rewards';
import { useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api, json } from '../../shared/api/client';
import { getCart } from '../cart/cart-api';
import { getAddresses } from '../addresses/address-api';
import { type Order } from '../orders/types';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

export default function Checkout() {
  const rewards = useRewards();
  const navigate = useNavigate();
  const location = useLocation();
  const attempt = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  const data = useResource(
    signal => Promise.all([getCart(signal), getAddresses(signal)]),
    'checkout',
  );
  return (
    <>
      <Title
        label="مراجعة الطلب"
        detail="سيحسب المتجر الإجمالي على الخادم ويؤكد سعر الطلب."
      />
      <Result state={data}>
        {([cart, addresses]) =>
          !cart.items.length ? (
            <Empty title="السلّة فارغة" />
          ) : !addresses.length ? (
            <Empty title="أضف عنوان توصيل للمتابعة">
              <Link className="button" to="/addresses">
                إضافة عنوان
              </Link>
            </Empty>
          ) : (
            <section className="surface padded narrow">
              <p>
                {cart.items.reduce((n, i) => n + i.quantity, 0)} قطعة في السلة
              </p>
              {location.state?.storeId === cart.storeId && location.state?.note && <p>ملاحظة الطلب: {location.state.note}</p>}
              <ActionForm
                label="تأكيد الطلب"
                submit={async fields => {
                  const payload = {
                    addressId: Number(fields.get('addressId')),
                    cartVersion: cart.version,
                    paymentMethod: fields.get('paymentMethod'),
                    ...(location.state?.storeId === cart.storeId && location.state?.note && { note: location.state.note }),
                    ...(fields.has('redeemReward') && { redeemReward: true }),
                  };
                  const signature = JSON.stringify(payload);
                  if (attempt.current?.signature !== signature)
                    attempt.current = { signature, key: crypto.randomUUID() };
                  try {
                    const order = await api<Order>('/orders', {
                      ...json('POST', payload),
                      headers: { 'Idempotency-Key': attempt.current.key },
                    });
                    navigate(`/orders/${order.id}`, { replace: true });
                  } catch (error) {
                    if (error instanceof ApiError && error.status === 409)
                      { data.reload(); rewards.reload(); }
                    throw error;
                  }
                }}
              >
                <label>
                  عنوان التوصيل
                  <select name="addressId">
                    {addresses.map(a => (
                      <option value={a.id} key={a.id}>
                        {a.label} — {a.address}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  طريقة الدفع
                  <select name="paymentMethod">
                    <option value="CASH">الدفع عند الاستلام</option>
                    {import.meta.env.VITE_BANK_TRANSFER_ENABLED === 'true' && (
                      <option value="BANK_TRANSFER">التحويل البنكي</option>
                    )}
                  </select>
                </label>
                {rewards.data && rewards.data.balance >= rewards.data.pointsRequired && (
                  <label className="check">
                    <input type="checkbox" name="redeemReward" />
                    استخدم {rewards.data.pointsRequired} نقطة لخصم {rewards.data.discountPercent}٪ من السعر المؤكد
                  </label>
                )}
              </ActionForm>
              <Link className="text-link" to="/cart" state={location.state}>
                العودة للسلة
              </Link>
            </section>
          )
        }
      </Result>
    </>
  );
}
