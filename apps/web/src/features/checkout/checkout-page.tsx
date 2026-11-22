import { useRewards } from '../account/rewards';
import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useIdentity } from '../../shared/auth/identity';
import { AddressEditor } from '../addresses/address-editor';
import '../addresses/addresses.css';
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
  const { profile, refreshProfile } = useIdentity();
  const [editingAddress, setEditingAddress] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<number>();
  const selectedAddress = (addresses: Awaited<ReturnType<typeof getAddresses>>) => addresses.find(item => item.id === selectedAddressId) ?? addresses.find(item => item.id === profile?.defaultAddressId) ?? addresses[0];
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
          ) : !addresses.length || editingAddress ? (
            <div className="address-page">
              <AddressEditor address={editingAddress ? selectedAddress(addresses) : undefined}
                onCancel={addresses.length ? () => setEditingAddress(false) : undefined}
                onSaved={async saved => { setSelectedAddressId(saved?.id); await refreshProfile(); setEditingAddress(false); data.reload(); }} />
            </div>
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
                    addressId: selectedAddress(addresses).id,
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
                    navigate(`/orders/${order.id}`, { replace: true, state: { submitted: true } });
                  } catch (error) {
                    if (error instanceof ApiError && error.status === 409)
                      { data.reload(); rewards.reload(); }
                    throw error;
                  }
                }}
              >
                <div className="checkout-address-card">
                  <MapPin size={23} />
                  <div><strong>عنوان التوصيل</strong><p>{selectedAddress(addresses).address}</p></div>
                  <button type="button" className="secondary" onClick={() => setEditingAddress(true)}>تعديل</button>
                </div>
                {addresses.length > 1 && <label>اختر عنواناً محفوظاً<select name="addressId" value={selectedAddress(addresses).id} onChange={event => setSelectedAddressId(Number(event.target.value))}>
                  {addresses.map(address => <option value={address.id} key={address.id}>{address.label} — {address.address}</option>)}
                </select></label>}
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
