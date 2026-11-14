import { useState } from 'react';
import { api, ApiError, json } from '../../shared/api/client';
import { useResource } from '../../shared/hooks/use-resource';
import { money } from '../../shared/lib/money';
import { ActionForm, Field } from '../../shared/ui/form';
import { Empty, Result } from '../../shared/ui/feedback';
import { Pager } from '../../shared/ui/pager';
import type { Product } from '../catalog/types';
import { ProductImage } from '../catalog/product-image';

type Section = { prodCategoryId: number; nameAr: string; nameEn?: string };
type ManagedProduct = Product & {
  prodCategoryId?: number;
  productCategory?: Section;
  nameEn?: string;
  descriptionEn?: string;
  isAvailable: boolean;
};
const maxImageSize = 5 * 1024 * 1024;

export default function Products({ storeId }: { storeId: number }) {
  const [page, setPage] = useState(1);
  const [created, setCreated] = useState('');
  const categories = useResource(
    signal =>
      api<Section[]>(
        `/product-categories?storeId=${storeId}&limit=100`,
        { signal },
      ),
    `sections:${storeId}`,
  );
  const products = useResource(
    signal =>
      api<ManagedProduct[]>(
        `/products/store/${storeId}?availableOnly=false&limit=20&page=${page}`,
        { signal },
      ),
    `products:${storeId}:${page}`,
  );

  return (
    <section className="surface padded stack">
      <h2>منتجات المتجر</h2>
      <details>
        <summary>أقسام المنتجات</summary>
        <ActionForm
          key={created}
          label="إضافة قسم"
          submit={async data => {
            const nameAr = String(data.get('nameAr')).trim();
            const nameEn = String(data.get('nameEn')).trim();
            if (nameAr.length < 2)
              throw new ApiError(400, 'أدخل اسمًا للقسم من حرفين على الأقل.');
            const category = await api<Section>(
              '/product-categories',
              json('POST', { storeId, nameAr, ...(nameEn && { nameEn }) }),
            );
            setCreated(String(category.prodCategoryId));
            categories.reload();
          }}
        >
          <Field label="اسم القسم بالعربية" name="nameAr" maxLength={191} />
          <Field
            label="اسم القسم بالإنجليزية"
            name="nameEn"
            maxLength={191}
            required={false}
          />
        </ActionForm>
        <Result state={categories}>
          {rows =>
            rows.length ? (
              <ul>
                {rows.map(row => (
                  <li key={row.prodCategoryId}>
                    <details>
                      <summary>{row.nameAr}</summary>
                      <ActionForm
                        label="حفظ اسم القسم"
                        submit={async data => {
                          const nameAr = String(data.get('nameAr')).trim();
                          const nameEn = String(data.get('nameEn')).trim();
                          if (nameAr.length < 2)
                            throw new ApiError(
                              400,
                              'أدخل اسمًا للقسم من حرفين على الأقل.',
                            );
                          await api(
                            `/product-categories/${row.prodCategoryId}`,
                            json('PATCH', { nameAr, nameEn }),
                          );
                          categories.reload();
                          products.reload();
                        }}
                      >
                        <Field
                          label="اسم القسم بالعربية"
                          name="nameAr"
                          defaultValue={row.nameAr}
                          maxLength={191}
                        />
                        <Field
                          label="اسم القسم بالإنجليزية"
                          name="nameEn"
                          defaultValue={row.nameEn}
                          maxLength={191}
                          required={false}
                        />
                      </ActionForm>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p>أضف قسمًا مثل الوجبات أو المشروبات.</p>
            )
          }
        </Result>
      </details>
      <details>
        <summary>إضافة منتج</summary>
        <Result state={categories}>
          {rows =>
            rows.length ? (
              <ProductForm
                storeId={storeId}
                categories={rows}
                reload={() => {
                  setPage(1);
                  products.reload();
                }}
              />
            ) : (
              <p>أضف قسمًا للمتجر أولًا ليظهر نموذج المنتج.</p>
            )
          }
        </Result>
      </details>
      <Result state={products}>
        {rows => (
          <>
            <div className="grid">
              {rows.map(product => (
                <article
                  className="surface product-card"
                  key={product.productId}
                >
                  {product.imageUrl && (
                    <ProductImage src={product.imageUrl} />
                  )}
                  <h3>{product.nameAr}</h3>
                  <p>
                    {product.productCategory?.nameAr ?? 'بلا قسم'} ·{' '}
                    {product.isAvailable ? 'متاح' : 'غير متاح'}
                  </p>
                  {product.descriptionAr && <p>{product.descriptionAr}</p>}
                  <strong>
                    {money(product.estimatedPriceMin)}
                    {!product.isPriceFixed &&
                      ` – ${money(product.estimatedPriceMax)}`}
                  </strong>
                  <details>
                    <summary>تعديل المنتج</summary>
                    <Result state={categories}>
                      {sections => (
                        <ProductForm
                          storeId={storeId}
                          product={product}
                          categories={sections}
                          reload={products.reload}
                        />
                      )}
                    </Result>
                  </details>
                </article>
              ))}
            </div>
            {!rows.length && <Empty title="لا توجد منتجات في هذه الصفحة" />}
            <Pager page={page} more={rows.length === 20} setPage={setPage} />
          </>
        )}
      </Result>
    </section>
  );
}

function ProductForm({
  storeId,
  product,
  categories,
  reload,
}: {
  storeId: number;
  product?: ManagedProduct;
  categories: Section[];
  reload: () => void;
}) {
  const [saved, setSaved] = useState(0);
  const [fixed, setFixed] = useState(product?.isPriceFixed ?? true);
  const existingSection = product?.productCategory;
  const sectionOptions =
    existingSection &&
    !categories.some(
      section => section.prodCategoryId === existingSection.prodCategoryId,
    )
      ? [existingSection, ...categories]
      : categories;
  return (
    <>
      <ActionForm
        key={saved}
        label="حفظ المنتج"
        submit={async data => {
          const file = data.get('image');
          if (file instanceof File && file.size > maxImageSize)
            throw new ApiError(400, 'حجم الصورة يتجاوز 5 ميغابايت.');
          if (!(file instanceof File) || !file.size) {
            if (!product) throw new ApiError(400, 'اختر صورة للمنتج.');
            data.delete('image');
          }
          for (const name of [
            'nameAr',
            'nameEn',
            'descriptionAr',
            'descriptionEn',
            'unitAr',
            'priceNoteAr',
          ]) {
            data.set(name, String(data.get(name) ?? '').trim());
          }
          if (
            ['nameAr', 'nameEn'].some(name => String(data.get(name)).length < 2)
          )
            throw new ApiError(
              400,
              'أدخل اسم المنتج بالعربية والإنجليزية، بحرفين على الأقل لكل اسم.',
            );
          if (fixed)
            data.set(
              'estimatedPriceMax',
              String(data.get('estimatedPriceMin')),
            );
          if (
            Number(data.get('estimatedPriceMax')) <
            Number(data.get('estimatedPriceMin'))
          )
            throw new ApiError(
              400,
              'السعر الأعلى يجب أن يساوي السعر الأدنى أو يتجاوزه.',
            );
          if (!product) data.set('storeId', String(storeId));
          if (!data.get('prodCategoryId')) data.delete('prodCategoryId');
          data.set('isPriceFixed', String(fixed));
          data.set('isAvailable', String(data.has('isAvailable')));
          await api(product ? `/products/${product.productId}` : '/products', {
            method: product ? 'PATCH' : 'POST',
            body: data,
          });
          if (!product) setFixed(true);
          setSaved(value => value + 1);
          reload();
        }}
      >
        <Field
          label="اسم المنتج بالعربية"
          name="nameAr"
          defaultValue={product?.nameAr}
          maxLength={191}
        />
        <Field
          label="اسم المنتج بالإنجليزية"
          name="nameEn"
          defaultValue={product?.nameEn}
          maxLength={191}
        />
        <label>
          قسم المنتج
          <select
            name="prodCategoryId"
            required={!product}
            defaultValue={product?.prodCategoryId ?? ''}
          >
            {(!product?.prodCategoryId || !sectionOptions.length) && (
              <option value="">{product ? 'بلا قسم' : 'اختر قسمًا'}</option>
            )}
            {sectionOptions.map(section => (
              <option
                key={section.prodCategoryId}
                value={section.prodCategoryId}
              >
                {section.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label>
          وصف المنتج بالعربية
          <textarea
            name="descriptionAr"
            defaultValue={product?.descriptionAr}
            maxLength={4000}
            rows={3}
          />
        </label>
        <label>
          وصف المنتج بالإنجليزية
          <textarea
            name="descriptionEn"
            defaultValue={product?.descriptionEn}
            maxLength={4000}
            rows={2}
          />
        </label>
        <label>
          {product ? 'استبدال صورة المنتج' : 'صورة المنتج'}
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required={!product}
            aria-describedby={product ? undefined : 'product-image-help'}
          />
        </label>
        {!product && (
          <small id="product-image-help">
            JPG أو PNG أو WebP. الحد الأقصى 5 ميغابايت.
          </small>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={fixed}
            onChange={event => setFixed(event.target.checked)}
          />
          السعر ثابت
        </label>
        <div className="split">
          <Field
            label={fixed ? 'السعر (₪)' : 'السعر الأدنى (₪)'}
            name="estimatedPriceMin"
            type="number"
            min={0}
            max={99999999.99}
            step="0.01"
            defaultValue={product?.estimatedPriceMin}
          />
          {!fixed && (
            <Field
              label="السعر الأعلى (₪)"
              name="estimatedPriceMax"
              type="number"
              min={0}
              max={99999999.99}
              step="0.01"
              defaultValue={product?.estimatedPriceMax}
            />
          )}
        </div>
        <Field
          label="وحدة البيع (مثل قطعة أو كيلو)"
          name="unitAr"
          defaultValue={product?.unitAr}
          maxLength={191}
          required={false}
        />
        <Field
          label="ملاحظة السعر"
          name="priceNoteAr"
          defaultValue={product?.priceNoteAr}
          maxLength={191}
          required={false}
        />
        <label className="check">
          <input
            name="isAvailable"
            type="checkbox"
            defaultChecked={product?.isAvailable ?? true}
          />
          متاح للطلب
        </label>
      </ActionForm>
      {saved > 0 && <p role="status">تم حفظ المنتج.</p>}
    </>
  );
}
