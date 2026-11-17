import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Grid2X2, Heart, Minus, Package, Plus, Search, ShoppingBag } from 'lucide-react';
import './store-catalog.css';
import { api } from '../../shared/api/client';
import { type Product, type Store } from './types';
import { ProductImage } from './product-image';
import { useStoreCart } from './use-store-cart';
import { useIdentity } from '../../shared/auth/identity';
import { money } from '../../shared/lib/money';
import { Empty, ErrorBox, Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

type Section = { prodCategoryId: number; nameAr: string; parentId?: number | null; products?: Product[] };

export default function StorePage() {
  const { id } = useParams();
  return <StoreCatalog key={id} id={id} />;
}

function StoreCatalog({ id }: { id?: string }) {
  const { profile } = useIdentity();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const state = useResource(
    signal =>
      api<
        Store & {
          productCategories: Section[];
        }
      >(`/stores/${id}`, { signal }),
    `store:${id}`,
  );
  const [section, setSection] = useState<number>();
  const [subsection, setSubsection] = useState<number>();
  const activeCategory = subsection ?? section;
  const sections = useResource(
    signal => api<Section[]>(`/product-categories?storeId=${id}&limit=100`, { signal }),
    `store-sections:${id}`,
  );
  const showBestSellers = !activeCategory && !query;
  const products = useResource(
    signal =>
      profile
        ? api<Product[]>(showBestSellers ? `/products/store/${id}/best-sellers` : `/products/store/${id}?page=${page}&limit=25${activeCategory ? `&categoryId=${activeCategory}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`, {
            signal,
          })
        : Promise.resolve([]),
    `store-products:${id}:${page}:${activeCategory}:${query}:${profile?.user_id}`,
  );
  const basket = useStoreCart(Number(id), profile?.role === 'customer');
  const cartCount = basket.cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const min = basket.cart?.estimatedMin;
  const max = basket.cart?.estimatedMax;
  const total = min == null ? '' : max != null && Number(max) !== Number(min) ? `${money(min)} – ${money(max)}` : money(min);
  const categories = sections.data ?? state.data?.productCategories ?? [];
  const roots = categories.filter(category => !category.parentId || !categories.some(parent => parent.prodCategoryId === category.parentId));
  const children = categories.filter(category => category.parentId === section && section !== undefined);
  const previews = state.data?.productCategories ?? [];
  function categoryImage(category: Section) {
    return previews.find(item => item.prodCategoryId === category.prodCategoryId)?.products?.find(product => product.imageUrl)?.imageUrl
      ?? previews.find(item => item.parentId === category.prodCategoryId && item.products?.some(product => product.imageUrl))?.products?.find(product => product.imageUrl)?.imageUrl;
  }
  function choose(root?: number, child?: number) {
    setQuery('');
    setSection(root);
    setSubsection(child);
    setPage(1);
  }
  return (
    <Result state={state}>
      {store => (
        <div className="store-catalog">
          <div className="store-name-row">
            <h1>{store.storeNameAr || store.storeName}</h1>
            {profile?.role === 'customer' && <StoreFavorite storeId={store.storeId} />}
          </div>
          <div className="store-tools">
            <button type="button" className="secondary" aria-label={section ? 'العودة لأقسام المتجر' : 'العودة للمتاجر'} onClick={() => section ? choose() : navigate('/')}><ArrowRight size={20} /></button>
            <form className="store-search" onSubmit={event => {
              event.preventDefault();
              setQuery(String(new FormData(event.currentTarget).get('q') ?? '').trim());
                        setPage(1);
            }}>
              <Search size={19} aria-hidden="true" />
              <input key={activeCategory ?? 'all'} name="q" aria-label="البحث داخل المتجر" placeholder="ابحث داخل المتجر…" maxLength={80} />
              <button>بحث</button>
            </form>
          </div>
          {roots.length > 0 && (
            <section className="store-section-picker" aria-label="أقسام المتجر">
              <h2>{section ? 'تصفّح الأقسام' : 'تسوّق حسب القسم'}</h2>
              <div className={section ? 'store-section-rail' : 'store-section-grid'}>
                <CategoryTile label="كل المنتجات" current={!section} select={() => choose()} />
                {roots.map(category => (
                  <CategoryTile key={category.prodCategoryId} label={category.nameAr} image={categoryImage(category)}
                    current={category.prodCategoryId === section} select={() => choose(category.prodCategoryId)} />
                ))}
              </div>
              {children.length > 0 && (
                <div className="store-section-rail store-subsections" role="group" aria-label="الأقسام الفرعية">
                  <CategoryTile label="كل القسم" current={!subsection} select={() => choose(section)} />
                  {children.map(child => (
                    <CategoryTile key={child.prodCategoryId} label={child.nameAr} image={categoryImage(child)}
                      current={child.prodCategoryId === subsection} select={() => choose(section, child.prodCategoryId)} />
                  ))}
                </div>
              )}
            </section>
          )}
          <Title label={query ? `نتائج البحث عن «${query}»` : categories.find(category => category.prodCategoryId === activeCategory)?.nameAr || 'المنتجات الأكثر مبيعًا'} />
          {profile ? (
            <Result state={products}>
              {items => (
                <>
                  <ProductGrid items={items} basket={profile.role === 'customer' ? basket : undefined} emptyTitle={showBestSellers ? 'لا توجد مبيعات مكتملة لعرضها بعد' : undefined} />
                  {!showBestSellers && <div className="pagination">
                    <button
                      className="secondary"
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      السابق
                    </button>
                    <span>{page}</span>
                    <button
                      className="secondary"
                      disabled={items.length < 25}
                      onClick={() => setPage(p => p + 1)}
                    >
                      التالي
                    </button>
                  </div>}
                </>
              )}
            </Result>
          ) : null}
          {Boolean(basket.loadError) && !basket.cart && <ErrorBox error={basket.loadError} retry={basket.reload} />}
          {profile?.role === 'customer' && <div className="store-cart-bar">
            <Link to="/cart">
              <span className="store-cart-count" aria-label={`${cartCount} قطعة في السلة`}>{cartCount}</span>
              <ShoppingBag size={19} aria-hidden="true" /> عرض السلة
              {total && cartCount > 0 && <strong>{total}</strong>}
            </Link>
          </div>}
        </div>
      )}
    </Result>
  );
}
function StoreFavorite({ storeId }: { storeId: number }) {
  const state = useResource(signal => api<boolean>(`/favorites/stores/check/${storeId}`, { signal }), `favorite-store:${storeId}`);
  const [saved, setSaved] = useState<boolean>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const favorite = saved ?? state.data;

  async function toggle() {
    if (pending || favorite === undefined) return;
    setPending(true);
    setError(undefined);
    setSaved(!favorite);
    try {
      await api(`/favorites/stores/${storeId}`, { method: favorite ? 'DELETE' : 'POST' });
    } catch (failure) {
      setSaved(favorite);
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="store-favorite">
      <button type="button" className="secondary store-favorite-button" aria-pressed={!!favorite}
        disabled={pending || favorite === undefined} aria-label={favorite ? 'إزالة المتجر من المفضلة' : 'إضافة المتجر للمفضلة'} onClick={toggle}>
        <Heart size={17} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
        {favorite ? 'في المفضلة' : 'المفضلة'}
      </button>
      {Boolean(error || state.error) && <ErrorBox error={error || state.error} retry={state.error ? state.reload : undefined} />}
    </div>
  );
}

function CategoryTile({ label, image, current, select }: {
  label: string; image?: string; current: boolean; select: () => void;
}) {
  return (
    <button type="button" className="store-category-tile" aria-pressed={current} onClick={select}>
      <div className="store-category-art">{image ? <ProductImage src={image} /> : <Grid2X2 aria-hidden="true" size={29} />}</div>
      <span>{label}</span>
    </button>
  );
}

type StoreBasket = ReturnType<typeof useStoreCart>;

function ProductGrid({ items, basket, emptyTitle = 'لا توجد منتجات متاحة' }: {
  items: Product[]; basket?: StoreBasket; emptyTitle?: string;
}) {
  return items.length ? (
    <div className="store-product-grid">
      {items.map(product => <ProductTile key={product.productId} product={product} basket={basket} />)}
    </div>
  ) : <Empty title={emptyTitle} />;
}

function ProductTile({ product, basket }: { product: Product; basket?: StoreBasket }) {
  const [expanded, setExpanded] = useState(false);
  const [optionIds, setOptionIds] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const options = product.productOptions?.filter(option => option.isAvailable) ?? [];
  const selectedOptions = optionIds.filter(id => options.some(option => option.optionId === id));
  const lines = basket?.cart?.items.filter(line => line.productId === product.productId) ?? [];
  const hasVariants = options.length > 0 || lines.some(line => line.optionIds.length > 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const disabled = !basket?.cart || basket.pending !== undefined;
  const name = product.nameAr;

  function stepper(quantity: number, ids: number[], label = name) {
    return (
      <div className="store-quantity" role="group" aria-label={`كمية ${label}`}>
        <button type="button" disabled={disabled || !quantity} aria-label={`تقليل كمية ${label}`} onClick={() => void basket?.change(product.productId, ids, -1)}><Minus size={18} aria-hidden="true" /></button>
        <output aria-live="polite">{quantity}</output>
        <button type="button" disabled={disabled || quantity >= 99} aria-label={`زيادة كمية ${label}`} onClick={() => void basket?.change(product.productId, ids, 1)}><Plus size={18} aria-hidden="true" /></button>
      </div>
    );
  }

  return (
    <article className="store-product-tile">
      <div className="store-product-art">
        {product.imageUrl ? <ProductImage src={product.imageUrl} /> : <Package size={38} aria-hidden="true" />}
        {basket && (count > 0 && !hasVariants ? (
          <div className="store-quantity-overlay">{stepper(count, [])}</div>
        ) : (
          <button type="button" disabled={disabled} className="store-product-action" aria-expanded={hasVariants ? expanded : undefined}
            aria-label={hasVariants ? `خيارات ${name}` : `إضافة ${name} إلى السلة`}
            onClick={() => hasVariants ? setExpanded(value => !value) : void basket.change(product.productId, [], 1)}>
            {count || <Plus size={22} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <h3>{name}</h3>
      {product.unitAr && <p>{product.unitAr}</p>}
      <strong>{money(product.estimatedPriceMin)}{!product.isPriceFixed && ` – ${money(product.estimatedPriceMax)}`}</strong>
      {basket && expanded && (
        <div className="store-inline-options">
          {lines.map(line => {
            const label = line.optionIds.map(id => {
              const option = options.find(item => item.optionId === id);
              return option?.optionNameAr || option?.optionName || 'إضافة غير متاحة';
            }).join('، ') || 'بدون إضافات';
            return <div key={line.optionIds.join(',')}><small>{label}</small>{stepper(line.quantity, line.optionIds, `${name} (${label})`)}</div>;
          })}
          <fieldset disabled={disabled}>
            <legend>خيارات المنتج</legend>
            {options.map(option => <label key={option.optionId} className="check">
              <input type="checkbox" checked={selectedOptions.includes(option.optionId)} onChange={event => {
                const checked = event.target.checked;
                setOptionIds(ids => checked ? [...ids, option.optionId] : ids.filter(id => id !== option.optionId));
              }} />
              {option.optionNameAr || option.optionName} · {money(option.extraCost)}
            </label>)}
            <button type="button" onClick={() => void basket.change(product.productId, selectedOptions, 1)}>أضف إلى السلة</button>
          </fieldset>
        </div>
      )}
      {basket?.error?.productId === product.productId && <ErrorBox error={basket.error.reason} />}
      {(product.descriptionAr || product.priceNoteAr || basket) && <details className="store-inline-details">
        <summary>تفاصيل المنتج</summary>
        {product.descriptionAr && <p>{product.descriptionAr}</p>}
        {product.priceNoteAr && <p>{product.priceNoteAr}</p>}
        {basket && (saved ? <p role="status">تم حفظ المنتج في المفضلة</p> : <ActionForm label="احفظ المنتج في المفضلة" submit={async () => {
          await api(`/favorites/products/${product.productId}`, { method: 'POST' });
          setSaved(true);
        }} />)}
      </details>}
    </article>
  );
}
