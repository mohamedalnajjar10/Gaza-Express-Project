import { useState } from 'react';
import { api, json } from '../../shared/api/client';
import Products from './store-products';
import { storeStatuses, type ManagedStore } from './store-status';
import { Empty, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';
import { Pager } from '../../shared/ui/pager';

export default function OwnerStores() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number>();
  const state = useResource(
    signal =>
      api<ManagedStore[]>(`/stores/my-stores?page=${page}&limit=20`, {
        signal,
      }),
    `my-stores:${page}`,
  );
  const categories = useResource(
    signal =>
      api<{ categoryId: number; nameAr: string }[]>(
        '/store-categories?limit=100',
        { signal },
      ),
    'owner-categories',
  );
  return (
    <div className="stack">
      <details className="surface padded">
        <summary>إضافة متجر</summary>
        <Result state={categories}>
          {rows =>
            rows.length ? (
              <StoreForm categories={rows} reload={state.reload} />
            ) : (
              <>
                <p>
                  اطلب من المدير إضافة تصنيف من لوحة الإدارة ← تصنيفات المتاجر.
                </p>
                <button className="secondary" onClick={categories.reload}>
                  تحديث التصنيفات
                </button>
              </>
            )
          }
        </Result>
      </details>
      <Result state={state}>
        {rows => (
          <>
            <div className="grid">
              {rows.map(store => (
                <article key={store.storeId} className="surface padded">
                  <h2>{store.storeNameAr || store.storeName}</h2>
                  <p>
                    {storeStatuses[store.status]} ·{' '}
                    {store.isOpenNow ? 'مفتوح' : 'مغلق'}
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      setSelected(
                        selected === store.storeId ? undefined : store.storeId,
                      )
                    }
                  >
                    {selected === store.storeId
                      ? 'إخفاء المنتجات'
                      : 'إدارة المنتجات'}
                  </button>
                  {store.status === 'ACTIVE' && (
                    <ActionForm
                      label={store.isOpenNow ? 'إغلاق المتجر' : 'فتح المتجر'}
                      submit={async () => {
                        await api(`/stores/${store.storeId}/toggle-status`, {
                          method: 'PATCH',
                        });
                        state.reload();
                      }}
                    />
                  )}
                  <details>
                    <summary>تعديل بيانات المتجر</summary>
                    <Result state={categories}>
                      {rows => (
                        <StoreForm
                          store={store}
                          categories={rows}
                          reload={state.reload}
                        />
                      )}
                    </Result>
                  </details>
                </article>
              ))}
            </div>
            {!rows.length && <Empty title="لا توجد متاجر في هذه الصفحة" />}
            <Pager page={page} more={rows.length === 20} setPage={setPage} />
          </>
        )}
      </Result>
      {selected && <Products key={selected} storeId={selected} />}
    </div>
  );
}

function StoreForm({
  store,
  categories,
  reload,
}: {
  store?: ManagedStore;
  categories: { categoryId: number; nameAr: string }[];
  reload: () => void;
}) {
  return (
    <ActionForm
      label="حفظ المتجر"
      submit={async data => {
        const {
          storeName,
          storeNameAr,
          descriptionAr,
          categoryId,
          areaId,
          latitude,
          longitude,
        } = Object.fromEntries(data);
        await api(
          store ? `/stores/${store.storeId}` : '/stores',
          json(store ? 'PATCH' : 'POST', {
            storeName,
            storeNameAr,
            descriptionAr,
            categoryId: Number(categoryId),
            areaId: Number(areaId),
            ...(latitude !== '' && { latitude: Number(latitude) }),
            ...(longitude !== '' && { longitude: Number(longitude) }),
          }),
        );
        reload();
      }}
    >
      <Field
        label="اسم المتجر بالعربية"
        name="storeNameAr"
        defaultValue={store?.storeNameAr}
      />
      <Field
        label="اسم المتجر بالإنجليزية"
        name="storeName"
        defaultValue={store?.storeName}
      />
      <Field
        label="الوصف"
        name="descriptionAr"
        defaultValue={store?.descriptionAr}
        required={false}
      />
      <label>
        التصنيف
        <select name="categoryId" defaultValue={store?.categoryId}>
          {categories.map(c => (
            <option value={c.categoryId} key={c.categoryId}>
              {c.nameAr}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="رقم المنطقة"
        name="areaId"
        type="number"
        min={1}
        defaultValue={store?.areaId?.toString()}
      />
      <div className="split">
        <Field
          label="خط العرض"
          name="latitude"
          type="number"
          min={-90}
          max={90}
          step="any"
          required={!store}
        />
        <Field
          label="خط الطول"
          name="longitude"
          type="number"
          min={-180}
          max={180}
          step="any"
          required={!store}
        />
      </div>
    </ActionForm>
  );
}
