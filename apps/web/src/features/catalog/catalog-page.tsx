import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  Clock3,
  MapPin,
  Search,
  ShoppingBag,
  Store as StoreIcon,
  Star,
} from 'lucide-react';
import { api } from '../../shared/api/client';
import { type Store } from './types';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';

type StoresPage = {
  data: Store[];
  meta: { page: number; totalPages: number; total: number };
};
type Category = { categoryId: number; nameAr: string };
function StoreCard({ store }: { store: Store }) {
  return (
    <Link to={`/stores/${store.storeId}`} className="store-card surface">
      <div className="store-art">
        {store.coverImageUrl ? (
          <img src={store.coverImageUrl} alt="" loading="lazy" />
        ) : (
          <StoreIcon size={40} />
        )}
      </div>
      <div className="store-info">
        <span className={`badge ${store.isOpenNow ? '' : 'muted-badge'}`}>
          {store.isOpenNow ? 'مفتوح الآن' : 'مغلق'}
        </span>
        <h3>{store.storeNameAr || store.storeName}</h3>
        <p>{store.storeCategory?.nameAr || 'متجر محلي'}</p>
        <div className="meta">
          <span>
            <Star size={15} /> {Number(store.avgRating).toFixed(1)}
          </span>
          <span>
            <Clock3 size={15} /> {store.estimatedPrepMin} دقيقة تجهيز
          </span>
          <ArrowLeft size={17} />
        </div>
      </div>
    </Link>
  );
}
export default function CatalogPage() {
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
      <section className="hero">
        <div className="hero-content">
          <span className="hero-location">
            <MapPin size={16} /> تسوّق من المتاجر المحلية
          </span>
          <h1>
            شو بتحب
            <br />
            تطلب اليوم؟
          </h1>
          <p>اكتشف متاجر غزة، اختَر منتجاتك المفضّلة، وتابع طلبك حتى بابك.</p>
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
            <Search size={21} />
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
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-a" />
          <div className="orbit orbit-b" />
          <div className="art-pin">
            <MapPin size={38} />
          </div>
          <div className="art-bag">
            <ShoppingBag size={112} strokeWidth={1.35} />
          </div>
          <div className="art-clock">
            <Clock3 size={33} />
          </div>
        </div>
      </section>
      <section className="catalog" id="catalog">
        <div className="catalog-heading">
          <Title
            label={search ? `نتائج البحث عن «${search}»` : 'المتاجر'}
            detail="اعثر على المتجر المناسب لطلبك."
          />
          <a className="round-link" href="#stores" aria-label="عرض النتائج">
            <ArrowDown size={19} />
          </a>
        </div>
        <div className="chips" aria-label="تصنيفات المتاجر">
          <button
            className={!category ? 'chip selected' : 'chip'}
            aria-pressed={!category}
            onClick={() => change({ categoryId: '', page: '' })}
          >
            الكل
          </button>
          {categories.data?.map(item => (
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
              {item.nameAr}
            </button>
          ))}
        </div>
        <div id="stores">
          <Result state={stores}>
            {result =>
              result.data.length ? (
                <>
                  <div className="grid">
                    {result.data.map(store => (
                      <StoreCard key={store.storeId} store={store} />
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
