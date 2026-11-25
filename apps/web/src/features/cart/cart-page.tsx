import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageSquare, Minus, Package, Plus, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { money } from '../../shared/lib/money';
import { Empty, ErrorBox, Result } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';
import { ProductImage } from '../catalog/product-image';
import type { Product } from '../catalog/types';
import { getCart, replaceCart, type Cart } from './cart-api';
import { clearCartNote, getCartNote, setCartNote } from './cart-note';
import './cart.css';

function price(min?: string | number | null, max?: string | number | null) {
  if (min == null) return '—';
  return max != null && Number(min) !== Number(max) ? `${money(min)} – ${money(max)}` : money(min);
}

export default function CartPage() {
  const state = useResource(getCart, 'cart');
  return <Result state={state}>{cart => <CartContents initial={cart} />}</Result>;
}

function CartContents({ initial }: { initial: Cart }) {
  const location = useLocation();
  const [cart, setCart] = useState(initial);
  useEffect(() => {
    setCart(initial);
  }, [initial]);
  const [note, setNote] = useState<string>(() =>
    location.state?.storeId === initial.storeId && typeof location.state?.note === 'string'
      ? location.state.note
      : getCartNote(initial.storeId),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const lock = useRef(false);
  const storeId = cart.storeId;
  const storeLink = storeId ? `/stores/${storeId}` : '/';
  useEffect(() => {
    if (storeId) setCartNote(storeId, note);
  }, [storeId, note]);
  const recommendations = useResource(
    signal => storeId ? api<Product[]>(`/products/store/${storeId}/best-sellers`, { signal }) : Promise.resolve([]),
    `cart-picks:${storeId}`,
  );
  const picks = recommendations.data?.filter(product => !cart.items.some(item => item.productId === product.productId)).slice(0, 6) ?? [];
  const products = new Map(cart.products?.map(product => [product.productId, product]));
  const total = price(cart.estimatedMin, cart.estimatedMax);

  async function update(items: Cart['items'], added?: Product) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    const currentStoreId = cart.storeId;
    try {
      const saved = await replaceCart(cart.version, items);
      if (!saved.items.length) clearCartNote(currentStoreId);
      setCart({
        ...cart,
        ...saved,
        products: saved.products ?? [
          ...(cart.products ?? []),
          ...(added ? [{ ...added, isAvailable: true }] : []),
        ],
      });
    } catch (failure) {
      setError(failure);
      try { setCart(await getCart()); } catch { /* retain the last confirmed cart */ }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  function changeQuantity(index: number, delta: number) {
    const quantity = cart.items[index].quantity + delta;
    if (quantity > 99 || quantity < 0) return;
    void update(cart.items.flatMap((item, i) => i !== index ? [item] : quantity ? [{ ...item, quantity }] : []));
  }

  return (
    <div className="cart-screen">
      <header className="cart-heading">
        <Link to={storeLink} className="icon-btn" aria-label="العودة للمتجر"><ArrowRight size={20} aria-hidden="true" /></Link>
        <div><h1>سلّتك</h1><p>{cart.store?.storeNameAr || cart.store?.storeName}</p></div>
        <Link to={storeLink} className="button secondary"><Plus size={17} aria-hidden="true" /> إضافة منتجات</Link>
      </header>
      {Boolean(error) && <ErrorBox error={error} />}
      {!cart.items.length ? (
        <Empty title="سلّتك فارغة"><Link className="button" to={storeLink}>تصفّح المتاجر</Link></Empty>
      ) : <>
        <ul className="cart-lines" aria-label="منتجات السلة" aria-busy={pending}>
          {cart.items.map((item, index) => {
            const product = products.get(item.productId);
            const name = product?.nameAr || `منتج #${item.productId}`;
            const optionIds = item.optionIds ?? [];
            const options = optionIds.map(id => product?.productOptions?.find(option => option.optionId === id));
            const extra = options.reduce((sum, option) => sum + Number(option?.extraCost ?? 0), 0);
            const available = product?.isAvailable && options.every(option => option?.isAvailable);
            return (
              <li className="cart-line" key={`${item.productId}:${optionIds.join(',')}`}>
                <div className="cart-photo">{product?.imageUrl ? <ProductImage src={product.imageUrl} /> : <Package size={28} aria-hidden="true" />}</div>
                <div className="cart-line-info">
                  <h2>{name}</h2>
                  {product?.unitAr && <small>{product.unitAr}</small>}
                  {options.length > 0 && <small>{options.map(option => option?.optionNameAr || option?.optionName || 'إضافة غير متاحة').join('، ')}</small>}
                  {available ? <strong>{price((Number(product.estimatedPriceMin) + extra) * item.quantity, (Number(product.isPriceFixed ? product.estimatedPriceMin : (product.estimatedPriceMax ?? product.estimatedPriceMin)) + extra) * item.quantity)}</strong> : <small>غير متاح حاليًا</small>}
                </div>
                <div className="cart-line-actions">
                  <div className="cart-stepper" role="group" aria-label={`كمية ${name}`}>
                    <button disabled={pending || (!available && item.quantity > 1)} onClick={() => changeQuantity(index, -1)} aria-label={`تقليل كمية ${name}`}><Minus size={17} aria-hidden="true" /></button>
                    <output aria-live="polite">{item.quantity}</output>
                    <button disabled={pending || !available || item.quantity >= 99} onClick={() => changeQuantity(index, 1)} aria-label={`زيادة كمية ${name}`}><Plus size={17} aria-hidden="true" /></button>
                  </div>
                  <button className="cart-remove" disabled={pending} onClick={() => void update(cart.items.filter((_, i) => i !== index))} aria-label={`إزالة ${name}`}><Trash2 size={16} aria-hidden="true" /></button>
                </div>
              </li>
            );
          })}
        </ul>
        {!!picks.length && <section className="cart-section">
          <h2>الأكثر مبيعًا في هذا المتجر</h2>
          <div className="cart-picks">
            {picks.map(product => <article key={product.productId}>
              <div className="cart-photo">
                {product.imageUrl ? <ProductImage src={product.imageUrl} /> : <Package size={30} aria-hidden="true" />}
                {product.productOptions?.some(option => option.isAvailable)
                  ? <Link className="button secondary cart-pick-action" to={storeLink} aria-label={`خيارات ${product.nameAr} في المتجر`}><Plus size={17} aria-hidden="true" /></Link>
                  : <button className="secondary cart-pick-action" disabled={pending} aria-label={`إضافة ${product.nameAr} إلى السلة`} onClick={() => void update([...cart.items, { productId: product.productId, quantity: 1, optionIds: [] }], product)}><Plus size={17} aria-hidden="true" /></button>}
              </div>
              <h3>{product.nameAr}</h3><strong>{price(product.estimatedPriceMin, product.isPriceFixed ? undefined : product.estimatedPriceMax)}</strong>
            </article>)}
          </div>
        </section>}
        <section className="cart-section cart-note">
          <h2><MessageSquare size={19} aria-hidden="true" /> طلبات خاصة</h2>
          <label htmlFor="cart-note">ملاحظة للمتجر (اختياري)</label>
          <textarea id="cart-note" maxLength={400} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="مثال: يرجى فصل المشروبات عن الطعام" />
        </section>
        <section className="cart-section cart-summary">
          <h2>ملخص الدفع</h2>
          <dl>
            <div><dt>إجمالي المنتجات</dt><dd>{total}</dd></div>
            <div><dt>خصم المكافآت</dt><dd>يُختار عند تأكيد الطلب إن توفّر</dd></div>
            <div className="cart-total"><dt>الإجمالي قبل الخصم</dt><dd>{total}</dd></div>
          </dl>
          {cart.estimatedMin == null ? <p>تعذّر حساب الإجمالي. راجع المنتجات والإضافات غير المتاحة.</p> : <p>يؤكّد المتجر السعر النهائي للمنتجات ذات السعر التقديري.</p>}
          <button className="secondary" disabled={pending} onClick={() => void update([])}>إفراغ السلة</button>
        </section>
        <div className="cart-checkout">
          {pending ? <button disabled>جارٍ تحديث السلة…</button> : <Link className="button" to="/checkout" state={{ storeId, note: note.trim() }}>المتابعة إلى الدفع <strong>{total}</strong></Link>}
        </div>
      </>}
    </div>
  );
}
