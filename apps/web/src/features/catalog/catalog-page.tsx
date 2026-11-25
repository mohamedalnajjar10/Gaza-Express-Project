import { StoreTile } from './store-tile';
import { Link, useSearchParams } from 'react-router-dom';
import {
  LayoutGrid, Utensils, Croissant, Smartphone, ShoppingCart, Building2,
  ArrowLeft,
  MapPin,
  Search,
  ShoppingBag,
  Store as StoreIcon,
} from 'lucide-react';
import { useIdentity } from '../../shared/auth/identity';
import type { Order } from '../orders/types';
import { api } from '../../shared/api/client';
import { type Store } from './types';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';

type StoresPage = {
  data: Store[];
  meta: { page: number; totalPages: number; total: number };
};
type Category = { categoryId: number; nameAr: string };
export default function CatalogPage() {
  const { profile } = useIdentity();
  const customer = profile?.role === 'customer';
  const recent = useResource(
    signal => customer ? api<{ orders: Order[] }>('/orders', { signal }) : Promise.resolve(null),
    `recent:${profile?.user_id}`,
  );
  const recentStores = [...new Map((recent.data?.orders || []).filter(order => order.status === 'DELIVERED').map(order => [order.storeId, order])).values()].slice(0, 6);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const category = params.get('categoryId') || '';
  const page = Number(params.get('page') || 1);
  const categories = useResource(
    signal => api<Category[]>('/store-categories', { signal }),
    'categories',
  );
  const stores = useResource(
    signal =>
      api<StoresPage>(
        `/stores?${new URLSearchParams({ limit: '12', page: String(page), ...(search && { search }), ...(category && { categoryId: category }) })}`,
        { signal },
      ),
    params.toString(),
  );
  const change = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  return (
    <>
      <section className="market-hero">
        <div className="hero-content">
          {customer && <Link className="market-location" to="/addresses"><MapPin size={18} aria-hidden="true" /> عنوان التوصيل <ArrowLeft size={16} aria-hidden="true" /></Link>}
          <h1>شو بتحب تطلب اليوم؟</h1>
          <form
            className="search"
            onSubmit={event => {
              event.preventDefault();
              change({
                search: String(
                  new FormData(event.currentTarget).get('search'),
                ).trim(),
                page: '',
              });
            }}
          >
            <Search size={21} aria-hidden="true" />
            <input
              key={search}
              name="search"
              aria-label="ابحث عن متجر"
              placeholder="ابحث عن متجر أو مخبز…"
              defaultValue={search}
              maxLength={80}
            />
            <button>بحث</button>
          </form>
        </div>
        <ShoppingBag className="market-art" size={115} strokeWidth={1.3} aria-hidden="true" />
      </section>
      <section className="catalog" id="catalog">
        <div className="market-categories" aria-label="تصنيفات المتاجر">
          <button
            className={!category ? 'chip selected' : 'chip'}
            aria-pressed={!category}
            onClick={() => change({ categoryId: '', page: '' })}
          >
            <LayoutGrid aria-hidden="true" /> الكل
          </button>
          {categories.data?.map(item => {
            const Icon = ({ مطاعم: Utensils, مخبز: Croissant, 'محل جوالات': Smartphone, 'سوبر ماركت': ShoppingCart, مول: Building2 })[item.nameAr] || StoreIcon;
            return (
            <button
              className={
                category === String(item.categoryId) ? 'chip selected' : 'chip'
              }
              key={item.categoryId}
              aria-pressed={category === String(item.categoryId)}
              onClick={() =>
                change({ categoryId: String(item.categoryId), page: '' })
              }
            >
              <Icon aria-hidden="true" /> {item.nameAr}
            </button>
          ); })}
        </div>
        {!search && !category && recentStores.length > 0 && (
          <section className="market-recent">
            <h2>اطلب مجددًا</h2>
            <div>{recentStores.map(order => <StoreTile key={order.storeId} id={order.storeId} name={order.store?.storeNameAr || order.storeName} logo={order.store?.logoUrl} cover={order.store?.coverImageUrl} />)}</div>
          </section>
        )}
        <Title label={search ? `نتائج البحث عن «${search}»` : 'تسوّق من المتاجر'} />
        <div id="stores">
          <Result state={stores}>
            {result =>
              result.data.length ? (
                <>
                  <div className="store-tiles">
                    {result.data.map(store => (
                      <StoreTile key={store.storeId} id={store.storeId} name={store.storeNameAr || store.storeName} logo={store.logoUrl} cover={store.coverImageUrl} />
                    ))}
                  </div>
                  {result.meta.totalPages > 1 && (
                    <div className="pagination">
                      <button
                        className="secondary"
                        disabled={page <= 1}
                        onClick={() => change({ page: String(page - 1) })}
                      >
                        السابق
                      </button>
                      <span>
                        {page} / {result.meta.totalPages}
                      </span>
                      <button
                        className="secondary"
                        disabled={page >= result.meta.totalPages}
                        onClick={() => change({ page: String(page + 1) })}
                      >
                        التالي
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <Empty
                  title={
                    search || category
                      ? 'لم نجد متاجر مطابقة'
                      : 'لا توجد متاجر متاحة حاليًا'
                  }
                >
                  {(search || category) && (
                    <button className="secondary" onClick={() => setParams({})}>
                      مسح التصفية
                    </button>
                  )}
                </Empty>
              )
            }
          </Result>
        </div>
      </section>
    </>
  );
}
