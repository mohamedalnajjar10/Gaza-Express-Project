import { useRef, useState } from 'react';
import { Banknote, Check, Copy, Landmark, MapPin, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api, json } from '../../shared/api/client';
import { useIdentity } from '../../shared/auth/identity';
import { useResource } from '../../shared/hooks/use-resource';
import { money } from '../../shared/lib/money';
import { PLATFORM_BANK_PHONE } from '../../shared/lib/numbers';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { useRewards } from '../../shared/ui/rewards';
import { getAddresses, type Address } from '../addresses/address-api';
import { AddressEditor } from '../addresses/address-editor';
import '../addresses/addresses.css';
import { getCart, type Cart } from '../cart/cart-api';
import { clearCartNote, getCartNote } from '../cart/cart-note';
import '../orders/payment.css';
import { type Order } from '../orders/types';

type DeliveryQuoteResponse = {
  storeId: number;
  addressId: number;
  deliveryDistanceKm: string;
  deliveryRangeKm: string;
  withinRange: boolean;
  deliveryFee: string;
  freeDeliveryApplied: boolean;
  freeDeliveryThreshold: string | null;
};

type DeliveryEstimate = {
  distance: number | null;
  fee: number;
  freeDeliveryApplied: boolean;
  threshold: number | null;
  outOfRange: boolean;
  hasPricing: boolean;
};

function hasValidCoords(
  store: Cart['store'] | undefined,
  address: Address | undefined,
): boolean {
  if (!store || !address) return false;
  const sLat = store.latitude != null ? Number(store.latitude) : NaN;
  const sLon = store.longitude != null ? Number(store.longitude) : NaN;
  const aLat = address.latitude != null ? Number(address.latitude) : NaN;
  const aLon = address.longitude != null ? Number(address.longitude) : NaN;
  return (
    Number.isFinite(sLat) &&
    Number.isFinite(sLon) &&
    Number.isFinite(aLat) &&
    Number.isFinite(aLon)
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function estimateDelivery(
  store: Cart['store'] | undefined,
  address: Address | undefined,
  itemsMin: number | null,
): DeliveryEstimate | null {
  if (!store || !address) return null;
  const hasPricing =
    store.deliveryBaseFee != null ||
    store.deliveryPerKmFee != null ||
    store.freeDeliveryThreshold != null;
  const coordsOk = hasValidCoords(store, address);
  if (!hasPricing && !coordsOk) return null;
  const distance = coordsOk
    ? Math.round(
        haversineKm(
          Number(store.latitude),
          Number(store.longitude),
          Number(address.latitude),
          Number(address.longitude),
        ) * 100,
      ) / 100
    : null;
  const threshold =
    store.freeDeliveryThreshold != null ? Number(store.freeDeliveryThreshold) : null;
  const freeDeliveryApplied =
    threshold !== null && itemsMin !== null && itemsMin >= threshold;
  const baseFee = Number(store.deliveryBaseFee ?? 0);
  const perKmFee = Number(store.deliveryPerKmFee ?? 0);
  const fee = freeDeliveryApplied
    ? 0
    : Math.round((baseFee + perKmFee * (distance ?? 0)) * 100) / 100;
  const rangeKm = store.deliveryRangeKm != null ? Number(store.deliveryRangeKm) : null;
  const outOfRange = distance !== null && rangeKm !== null && distance > rangeKm;
  return { distance, fee, freeDeliveryApplied, threshold, outOfRange, hasPricing };
}

function fromServerQuote(quote: DeliveryQuoteResponse | null | undefined): DeliveryEstimate | null {
  if (!quote || quote.deliveryFee == null) return null;
  const fee = Number(quote.deliveryFee);
  const distance = quote.deliveryDistanceKm != null ? Number(quote.deliveryDistanceKm) : NaN;
  if (!Number.isFinite(fee)) return null;
  return {
    distance: Number.isFinite(distance) ? distance : null,
    fee,
    freeDeliveryApplied: Boolean(quote.freeDeliveryApplied),
    threshold: quote.freeDeliveryThreshold != null ? Number(quote.freeDeliveryThreshold) : null,
    outOfRange: quote.withinRange === false,
    hasPricing: true,
  };
}

export default function Checkout() {
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [redeemReward, setRedeemReward] = useState(false);
  const rewards = useRewards();
  const { profile, refreshProfile } = useIdentity();
  const [editingAddress, setEditingAddress] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<number>();
  const selectedAddress = (addresses: Address[]) =>
    addresses.find(item => item.id === selectedAddressId) ??
    addresses.find(item => item.id === profile?.defaultAddressId) ??
    addresses[0];
  const navigate = useNavigate();
  const location = useLocation();
  const attempt = useRef<{ signature: string; key: string } | undefined>(undefined);
  const data = useResource(
    signal => Promise.all([getCart(signal), getAddresses(signal)]),
    'checkout',
  );
  const cart = data.data?.[0];
  const addresses = data.data?.[1] ?? [];
  const activeAddress = addresses.length ? selectedAddress(addresses) : undefined;
  const estimatedSubtotal = cart?.estimatedMin != null ? Number(cart.estimatedMin) : null;
  const canQuote = Boolean(
    cart?.storeId &&
    activeAddress?.id &&
    hasValidCoords(cart.store, activeAddress),
  );
  const quoteKey = canQuote
    ? `delivery-quote:${cart!.storeId}:${activeAddress!.id}:${cart!.version}:${estimatedSubtotal ?? 0}`
    : 'delivery-quote:idle';
  const serverQuote = useResource(
    signal =>
      canQuote
        ? api<DeliveryQuoteResponse>(
            `/orders/delivery-quote?${new URLSearchParams({
              storeId: String(cart!.storeId),
              addressId: String(activeAddress!.id),
              ...(estimatedSubtotal != null
                ? { itemsSubtotal: estimatedSubtotal.toFixed(2) }
                : {}),
            })}`,
            { signal },
          ).catch(() => null)
        : Promise.resolve(null),
    quoteKey,
  );
  const bankTransferEnabled = import.meta.env.VITE_BANK_TRANSFER_ENABLED !== 'false';

  return (
    <>
      <Title
        label="مراجعة الطلب والدفع"
        detail="اختر طريقة الدفع المناسبة، وسيعتمد المتجر السعر النهائي على الخادم."
      />
      <Result state={data}>
        {([loadedCart, loadedAddresses]) => {
          const productsById = new Map(
            loadedCart.products?.map(product => [product.productId, product]),
          );
          const totalCount = loadedCart.items.reduce((n, i) => n + i.quantity, 0);
          const estimatedMin =
            loadedCart.estimatedMin != null ? Number(loadedCart.estimatedMin) : null;
          const estimatedMax =
            loadedCart.estimatedMax != null ? Number(loadedCart.estimatedMax) : null;
          const discountPercent =
            redeemReward && rewards.data ? rewards.data.discountPercent : 0;
          const netMin =
            estimatedMin != null ? estimatedMin * (1 - discountPercent / 100) : null;
          const netMax =
            estimatedMax != null ? estimatedMax * (1 - discountPercent / 100) : null;
          const currentAddress = loadedAddresses.length
            ? selectedAddress(loadedAddresses)
            : undefined;
          const delivery =
            fromServerQuote(serverQuote.data) ??
            estimateDelivery(loadedCart.store, currentAddress, estimatedMin);
          const totalWithDeliveryMin =
            netMin != null ? netMin + (delivery?.fee ?? 0) : null;
          const totalWithDeliveryMax =
            netMax != null ? netMax + (delivery?.fee ?? 0) : null;
          const cashPts = rewards.data?.pointsPerOrder ?? 10;
          const bankPts = rewards.data?.bankTransferPointsPerOrder ?? cashPts * 2;
          const orderNote = (
            location.state?.storeId === loadedCart.storeId &&
            typeof location.state?.note === 'string'
              ? location.state.note
              : getCartNote(loadedCart.storeId)
          ).trim();

          return !loadedCart.items.length ? (
            <Empty title="السلّة فارغة" />
          ) : !loadedAddresses.length || editingAddress ? (
            <div className="address-page">
              <AddressEditor
                address={editingAddress ? selectedAddress(loadedAddresses) : undefined}
                onCancel={loadedAddresses.length ? () => setEditingAddress(false) : undefined}
                onSaved={async saved => {
                  setSelectedAddressId(saved?.id);
                  await refreshProfile();
                  setEditingAddress(false);
                  data.reload();
                }}
              />
            </div>
          ) : (
            <section className="surface padded narrow stack">
              <div className="checkout-items-box">
                <h2>ملخص السلة ({totalCount} قطعة)</h2>
                {!!loadedCart.products?.length && (
                  <ul className="checkout-items-list">
                    {loadedCart.items.map((item, idx) => {
                      const product = productsById.get(item.productId);
                      const optionIds = item.optionIds ?? [];
                      const options = optionIds.map(id =>
                        product?.productOptions?.find(option => option.optionId === id),
                      );
                      const extra = options.reduce(
                        (sum, option) => sum + Number(option?.extraCost ?? 0),
                        0,
                      );
                      const available = product
                        ? options.every(option => option?.isAvailable !== false)
                        : false;
                      const lineMin = product
                        ? (Number(product.estimatedPriceMin) + extra) * item.quantity
                        : 0;
                      const lineMax = product
                        ? (Number(
                            product.isPriceFixed
                              ? product.estimatedPriceMin
                              : (product.estimatedPriceMax ?? product.estimatedPriceMin),
                          ) +
                            extra) *
                          item.quantity
                        : 0;
                      const optionNames = options
                        .map(option => option?.optionNameAr || option?.optionName)
                        .filter(Boolean)
                        .join('، ');
                      return (
                        <li key={`${item.productId}:${optionIds.join(',')}:${idx}`}>
                          <span>
                            {product?.nameAr || `منتج #${item.productId}`} × {item.quantity}
                            {optionNames ? ` (${optionNames})` : ''}
                          </span>
                          {product && (
                            <strong>
                              {available
                                ? lineMax !== lineMin
                                  ? `${money(lineMin)} – ${money(lineMax)}`
                                  : money(lineMin)
                                : 'غير متاح حاليًا'}
                            </strong>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {estimatedMin != null && (
                  <>
                    <div className="bop-detail-row">
                      <span>إجمالي المنتجات التقديري</span>
                      <strong>
                        {money(estimatedMin)}
                        {estimatedMax != null &&
                          estimatedMax !== estimatedMin &&
                          ` – ${money(estimatedMax)}`}
                      </strong>
                    </div>
                    {discountPercent > 0 && netMin != null && (
                      <div className="bop-detail-row">
                        <span>خصم المكافآت ({discountPercent}٪)</span>
                        <strong>
                          −{money(estimatedMin - netMin)}
                          {netMax != null &&
                            estimatedMax != null &&
                            estimatedMax !== estimatedMin &&
                            ` – −${money(estimatedMax - netMax)}`}
                        </strong>
                      </div>
                    )}
                    {delivery && (delivery.hasPricing || delivery.distance != null) && (
                      <div className="bop-detail-row">
                        <span>
                          رسوم التوصيل
                          {delivery.distance != null ? ` (${delivery.distance} كم)` : ''}
                        </span>
                        <strong>
                          {delivery.freeDeliveryApplied
                            ? 'توصيل مجاني'
                            : delivery.fee > 0
                              ? money(delivery.fee)
                              : money(0)}
                        </strong>
                      </div>
                    )}
                    {((delivery && (delivery.fee > 0 || delivery.freeDeliveryApplied)) ||
                      discountPercent > 0) &&
                      totalWithDeliveryMin != null && (
                        <div className="bop-detail-row">
                          <span>الإجمالي التقديري شامل التوصيل</span>
                          <strong>
                            {money(totalWithDeliveryMin)}
                            {totalWithDeliveryMax != null &&
                              estimatedMax !== estimatedMin &&
                              ` – ${money(totalWithDeliveryMax)}`}
                          </strong>
                        </div>
                      )}
                    {delivery?.threshold != null &&
                      !delivery.freeDeliveryApplied &&
                      estimatedMin < delivery.threshold && (
                        <small>
                          أضف منتجات بقيمة {money(delivery.threshold - estimatedMin)} إضافية
                          للحصول على توصيل مجاني.
                        </small>
                      )}
                    {delivery?.outOfRange && (
                      <p role="alert">
                        تنبيه: يبدو العنوان المحدد أبعد من نطاق توصيل المتجر (
                        {loadedCart.store?.deliveryRangeKm} كم).
                      </p>
                    )}
                  </>
                )}
                {orderNote && <p>ملاحظة الطلب: {orderNote}</p>}
              </div>

              <ActionForm
                label="تأكيد الطلب"
                submit={async fields => {
                  if (loadedCart.version < 1) {
                    throw new ApiError(400, 'يرجى تحديث السلة قبل تأكيد الطلب.');
                  }
                  const payload = {
                    addressId: selectedAddress(loadedAddresses).id,
                    cartVersion: loadedCart.version,
                    paymentMethod: fields.get('paymentMethod'),
                    ...(orderNote && { note: orderNote }),
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
                    clearCartNote(loadedCart.storeId);
                    navigate(`/orders/${order.id}`, {
                      replace: true,
                      state: { submitted: true },
                    });
                  } catch (error) {
                    if (error instanceof ApiError && error.status === 409) {
                      data.reload();
                      rewards.reload();
                    }
                    throw error;
                  }
                }}
              >
                <div className="checkout-address-card">
                  <MapPin size={23} aria-hidden="true" />
                  <div>
                    <strong>عنوان التوصيل</strong>
                    <p>{selectedAddress(loadedAddresses).address}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditingAddress(true)}
                  >
                    تعديل
                  </button>
                </div>
                {loadedAddresses.length > 1 && (
                  <label>
                    اختر عنواناً محفوظاً
                    <select
                      name="addressId"
                      value={selectedAddress(loadedAddresses).id}
                      onChange={event => setSelectedAddressId(Number(event.target.value))}
                    >
                      {loadedAddresses.map(address => (
                        <option value={address.id} key={address.id}>
                          {address.label} — {address.address}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <fieldset className="payment-methods">
                  <legend>طريقة الدفع</legend>
                  <div className="payment-method-grid">
                    <label className="payment-method-card">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="CASH"
                        checked={paymentMethod === 'CASH'}
                        onChange={() => setPaymentMethod('CASH')}
                      />
                      <div>
                        <strong>
                          <Banknote size={18} aria-hidden="true" /> الدفع عند الاستلام
                        </strong>
                        <small>ادفع نقداً للمندوب عند استلام طلبك.</small>
                      </div>
                    </label>
                    {bankTransferEnabled && (
                      <label className="payment-method-card">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="BANK_TRANSFER"
                          checked={paymentMethod === 'BANK_TRANSFER'}
                          onChange={() => setPaymentMethod('BANK_TRANSFER')}
                        />
                        <div>
                          <strong>
                            <Landmark size={18} aria-hidden="true" /> الدفع عبر بنك فلسطين
                          </strong>
                          <small>
                            تحويل عبر بنك فلسطين / PalPay مع رفع صورة الإيصال والتحقق منها.
                          </small>
                          <span className="bop-points-pill">
                            اكسب {bankPts} نقطة ولاء (ضعف النقاط)
                          </span>
                        </div>
                      </label>
                    )}
                  </div>
                </fieldset>

                {paymentMethod === 'BANK_TRANSFER' && loadedCart.storeId && (
                  <BankRecipient storeId={loadedCart.storeId} />
                )}

                {rewards.data && rewards.data.balance >= rewards.data.pointsRequired && (
                  <label className="check">
                    <input
                      type="checkbox"
                      name="redeemReward"
                      checked={redeemReward}
                      onChange={event => setRedeemReward(event.target.checked)}
                    />
                    استخدم {rewards.data.pointsRequired} نقطة لخصم{' '}
                    {rewards.data.discountPercent}٪ من السعر المؤكد
                  </label>
                )}
              </ActionForm>
              <Link
                className="text-link"
                to="/cart"
                state={{ storeId: loadedCart.storeId, note: orderNote }}
              >
                العودة للسلة
              </Link>
            </section>
          );
        }}
      </Result>
    </>
  );
}

function BankRecipient({ storeId }: { storeId: number }) {
  const [copied, setCopied] = useState(false);
  const state = useResource(
    signal =>
      api<{ bankTransferPhone?: string | null; storeNameAr?: string; storeName?: string }>(
        `/stores/${storeId}`,
        { signal },
      ),
    `checkout-bank:${storeId}`,
  );
  return (
    <Result state={state}>
      {store => {
        const recipient = store.bankTransferPhone || PLATFORM_BANK_PHONE;
        const isStoreAccount = Boolean(
          store.bankTransferPhone && store.bankTransferPhone !== PLATFORM_BANK_PHONE,
        );
        return (
          <div className="surface padded bop-card">
            <div className="bop-header">
              <div className="bop-brand">
                <span className="bop-brand-icon">
                  <Landmark size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3>بيانات التحويل — بنك فلسطين</h3>
                  <small>
                    {isStoreAccount
                      ? `حساب المتجر المعتمد (${store.storeNameAr || store.storeName || 'المتجر'})`
                      : 'الحساب الرسمي لمنصة غزة إكسبرس'}
                  </small>
                </div>
              </div>
              <span className="badge">
                <ShieldCheck size={14} aria-hidden="true" /> تحقق إلزامي من الإيصال
              </span>
            </div>
            <div className="bop-recipient-box">
              <div className="bop-detail-row">
                <div>
                  <span className="bop-detail-label">رقم التحويل عبر بنك فلسطين</span>
                  <strong className="bop-detail-value" dir="ltr">
                    {recipient}
                  </strong>
                </div>
                <button
                  type="button"
                  className="secondary copy-pill"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(recipient);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* clipboard optional */
                    }
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={15} aria-hidden="true" /> تم النسخ
                    </>
                  ) : (
                    <>
                      <Copy size={15} aria-hidden="true" /> نسخ الرقم
                    </>
                  )}
                </button>
              </div>
            </div>
            <ol className="bop-steps">
              <li>أكّد الطلب أولاً ليعتمد المتجر السعر النهائي بالشيكل.</li>
              <li>حوّل المبلغ عبر تطبيق بنك فلسطين / PalPay إلى الرقم أعلاه.</li>
              <li>
                أرفق صورة إيصال التحويل في صفحة الطلب؛ لا يُعتمد الدفع إلا بعد التحقق من
                أصالة الإيصال ومطابقته.
              </li>
            </ol>
          </div>
        );
      }}
    </Result>
  );
}
