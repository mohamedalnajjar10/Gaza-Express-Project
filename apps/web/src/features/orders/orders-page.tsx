import { useState } from 'react';
import { Search, RefreshCw, ArrowLeft, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { type Order } from './types';
import { orderLabels } from './status-labels';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';
import { useIdentity } from '../../shared/auth/identity';

const driverSections = [
  { label: 'عروض التوصيل', statuses: ['READY'] },
  { label: 'التوصيل الجاري', statuses: ['ASSIGNED', 'IN_TRANSIT'] },
  { label: 'سجل التوصيل', statuses: ['DELIVERED', 'CANCELLED', 'REJECTED'] },
];

function OrderList({ orders }: { orders: Order[] }) {
  return (
    <div className="stack">
      {orders.map((order) => (
        <Link
          className="surface padded list-row"
          to={`/orders/${order.id}`}
          key={order.id}
        >
          <div>
            <strong>طلب #{order.id}</strong>
            <p>{order.storeName}</p>
          </div>
          <span className="badge">
            {orderLabels[order.status] || order.status}
          </span>
          <ArrowLeft className="order-row-arrow" size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export default function Orders() {
  const { profile } = useIdentity();
  const heading = {
    customer: 'طلباتي',
    store_owner: 'طلبات متاجري',
    driver: 'مهام التوصيل',
    admin: 'الطلبات والمدفوعات',
  }[profile?.role ?? 'customer'];
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [before, setBefore] = useState<number | null>(null);
  const state = useResource(
    (signal) =>
      api<{ orders: Order[]; nextBefore: number | null }>(
        `/orders${before ? `?before=${before}` : ''}`,
        { signal },
      ),
    `orders:${before}`,
  );
  return (
    <>
      <Title
        label={heading}
        detail={
          profile?.role === 'store_owner'
            ? 'تابع رحلة كل طلب، من الاستلام حتى التسليم.'
            : undefined
        }
      />
      {profile?.role === 'store_owner' && (
        <div className="owner-orders-tools surface padded">
          <div className="owner-section-heading">
            <div>
              <ReceiptText size={24} aria-hidden="true" />
              <strong>مركز الطلبات</strong>
            </div>
            <button className="secondary" onClick={state.reload}>
              <RefreshCw size={16} aria-hidden="true" /> تحديث الطلبات
            </button>
          </div>
          <div className="owner-toolbar">
            <label className="owner-search">
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="البحث في الطلبات المعروضة"
                placeholder="رقم الطلب أو اسم المتجر…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="owner-filter">
              حالة الطلب
              <select
                aria-label="حالة الطلب"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">كل الحالات</option>
                {Object.entries(orderLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <small>البحث والتصفية ضمن الطلبات المعروضة في هذه الصفحة.</small>
        </div>
      )}
      <Result state={state}>
        {(result) =>
          result.orders.length ? (
            <div className="stack">
              {profile?.role === 'driver' ? (
                driverSections.map((section) => {
                  const orders = result.orders.filter((order) =>
                    section.statuses.includes(order.status),
                  );
                  return orders.length ? (
                    <section key={section.label}>
                      <h2>{section.label}</h2>
                      <OrderList orders={orders} />
                    </section>
                  ) : null;
                })
              ) : profile?.role === 'store_owner' ? (
                <>
                  <OrderList
                    orders={result.orders.filter(
                      (order) =>
                        (status === 'all' || order.status === status) &&
                        `${order.id} ${order.storeName}`.includes(query.trim()),
                    )}
                  />
                  {!result.orders.some(
                    (order) =>
                      (status === 'all' || order.status === status) &&
                      `${order.id} ${order.storeName}`.includes(query.trim()),
                  ) && (
                    <Empty title="لا توجد طلبات تطابق البحث">
                      <p>جرّب رقمًا آخر أو اختر كل الحالات.</p>
                    </Empty>
                  )}
                </>
              ) : (
                <OrderList orders={result.orders} />
              )}
              <div className="pagination">
                {before && (
                  <button className="secondary" onClick={() => setBefore(null)}>
                    الأحدث
                  </button>
                )}
                {result.nextBefore && (
                  <button
                    className="secondary"
                    onClick={() => setBefore(result.nextBefore)}
                  >
                    المزيد
                  </button>
                )}
              </div>
            </div>
          ) : (
            <Empty
              title={
                profile?.role === 'driver'
                  ? 'لا توجد مهام توصيل حاليًا'
                  : 'لا توجد طلبات بعد'
              }
            />
          )
        }
      </Result>
    </>
  );
}
