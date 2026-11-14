import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api } from '../../shared/api/client';
import { type Product, type Store } from './types';
import { ProductImage } from './product-image';
import { addCartItem } from '../cart/cart-api';
import { useIdentity } from '../../shared/auth/identity';
import { money } from '../../shared/lib/money';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

export default function StorePage() {
  const { id } = useParams();
  const { profile } = useIdentity();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const state = useResource(
    signal =>
      api<
        Store & {
          productCategories: {
            prodCategoryId: number;
            nameAr: string;
            products: Product[];
          }[];
        }
      >(`/stores/${id}`, { signal }),
    `store:${id}`,
  );
  const products = useResource(
    signal =>
      profile
        ? api<Product[]>(`/products/store/${id}?page=${page}&limit=25`, {
            signal,
          })
        : Promise.resolve([]),
    `store-products:${id}:${page}:${profile?.user_id}`,
  );
  const [selected, setSelected] = useState<Product>();
  return (
    <Result state={state}>
      {store => (
        <>
          <Link className="text-link" to="/">
            العودة للمتاجر
          </Link>
          <div className="surface store-header">
            <Title
              label={store.storeNameAr || store.storeName}
              detail={store.descriptionAr}
            />
            <span className="badge">
              {store.isOpenNow ? 'مفتوح الآن' : 'مغلق'}
            </span>
            {profile?.role === 'customer' && (
              <details>
                <summary>
                  <Heart size={17} /> المفضلة
                </summary>
                <ActionForm
                  label="احفظ المتجر"
                  submit={async () => {
                    await api(`/favorites/stores/${id}`, { method: 'POST' });
                    navigate('/favorites');
                  }}
                />
              </details>
            )}
          </div>
          <Title label="المنتجات" />
          {profile ? (
            <Result state={products}>
              {items => (
                <>
                  <ProductGrid items={items} select={setSelected} />
                  <div className="pagination">
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
                  </div>
                </>
              )}
            </Result>
          ) : (
            <ProductGrid
              items={store.productCategories.flatMap(c =>
                c.products.map(product => ({ ...product, productCategory: c })),
              )}
              select={setSelected}
            />
          )}{' '}
          {selected && (
            <div className="surface product-detail" id="product-details">
              <button
                className="secondary"
                onClick={() => setSelected(undefined)}
              >
                إغلاق التفاصيل
              </button>
              <Title label={selected.nameAr} detail={selected.descriptionAr} />
              {selected.unitAr && <p>وحدة البيع: {selected.unitAr}</p>}
              {selected.priceNoteAr && <p>{selected.priceNoteAr}</p>}
              {profile?.role === 'customer' ? (
                <>
                  <ActionForm
                    label="أضف إلى السلة"
                    submit={async data => {
                      await addCartItem(
                        Number(id),
                        selected.productId,
                        Number(data.get('quantity')),
                        data.getAll('option').map(Number),
                      );
                      navigate('/cart');
                    }}
                  >
                    <Field
                      label="الكمية"
                      name="quantity"
                      type="number"
                      min={1}
                      max={99}
                      defaultValue="1"
                    />
                    {selected.productOptions
                      ?.filter(option => option.isAvailable)
                      .map(option => (
                        <label className="check" key={option.optionId}>
                          <input
                            type="checkbox"
                            name="option"
                            value={option.optionId}
                          />
                          {option.optionNameAr || option.optionName} ·{' '}
                          {money(option.extraCost)}
                        </label>
                      ))}
                  </ActionForm>
                  <ActionForm
                    label="احفظ المنتج في المفضلة"
                    submit={async () => {
                      await api(`/favorites/products/${selected.productId}`, {
                        method: 'POST',
                      });
                      navigate('/favorites');
                    }}
                  />
                </>
              ) : null}
            </div>
          )}
        </>
      )}
    </Result>
  );
}
function ProductGrid({
  items,
  select,
}: {
  items: Product[];
  select: (p: Product) => void;
}) {
  return items.length ? (
    <div className="grid">
      {items.map(product => (
        <article key={product.productId} className="surface product-card">
          {product.imageUrl && (
            <ProductImage src={product.imageUrl} />
          )}
          <h3>{product.nameAr}</h3>
          {product.productCategory && (
            <span className="badge">{product.productCategory.nameAr}</span>
          )}
          <p>
            {product.descriptionAr ||
              (product.isPriceFixed ? 'سعر ثابت' : 'سعر تقديري')}
          </p>
          <strong>
            {money(product.estimatedPriceMin)}
            {!product.isPriceFixed && ` – ${money(product.estimatedPriceMax)}`}
          </strong>
          <button
            className="secondary"
            onClick={() => {
              select(product);
              requestAnimationFrame(() =>
                document
                  .getElementById('product-details')
                  ?.scrollIntoView({ block: 'start' }),
              );
            }}
          >
            عرض المنتج
          </button>
        </article>
      ))}
    </div>
  ) : (
    <Empty title="لا توجد منتجات متاحة" />
  );
}
