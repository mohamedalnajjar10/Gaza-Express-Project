import { useState } from 'react';
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
      {orders.map(order => (
        <Link className="surface padded list-row" to={`/orders/${order.id}`} key={order.id}>
          <div>
            <strong>طلب #{order.id}</strong>
            <p>{order.storeName}</p>
          </div>
          <span className="badge">{orderLabels[order.status] || order.status}</span>
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
  const [before, setBefore] = useState<number | null>(null);
  const state = useResource(
    signal =>
      api<{ orders: Order[]; nextBefore: number | null }>(
        `/orders${before ? `?before=${before}` : ''}`,
        { signal },
      ),
    `orders:${before}`,
  );
  return (
    <>
      <Title label={heading} />
      <Result state={state}>
        {result =>
          result.orders.length ? (
            <div className="stack">
              {profile?.role === 'driver' ? driverSections.map(section => {
                const orders = result.orders.filter(order => section.statuses.includes(order.status));
                return orders.length ? <section key={section.label}><h2>{section.label}</h2><OrderList orders={orders} /></section> : null;
              }) : <OrderList orders={result.orders} />}
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
            <Empty title={profile?.role === 'driver' ? 'لا توجد مهام توصيل حاليًا' : 'لا توجد طلبات بعد'} />
          )
        }
      </Result>
    </>
  );
}
