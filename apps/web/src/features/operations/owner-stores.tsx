import { useState } from 'react';
import {
  Store,
  MapPin,
  Package,
  Plus,
  Clock3,
  CheckCircle2,
  Search,
  RefreshCw,
} from 'lucide-react';
import { api, json } from '../../shared/api/client';
import Products from './store-products';
import { storeStatuses, type ManagedStore } from './store-status';
import { Empty, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';
import { Pager } from '../../shared/ui/pager';

const governorates = [
  { id: 1, name: 'غزة' },
  { id: 2, name: 'خانيونس' },
  { id: 3, name: 'رفح' },
  { id: 4, name: 'دير البلح' },
  { id: 5, name: 'النصيرات' },
  { id: 6, name: 'المغازي' },
  { id: 7, name: 'جباليا' },
];

export default function OwnerStores() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<number>();
  const state = useResource(
    (signal) =>
      api<ManagedStore[]>(`/stores/my-stores?page=${page}&limit=20`, {
        signal,
      }),
    `my-stores:${page}`,
  );
  const categories = useResource(
    (signal) =>
      api<{ categoryId: number; nameAr: string }[]>(
        '/store-categories?limit=100',
        { signal },
      ),
    'owner-categories',
  );
  const matchesStore = (store: ManagedStore) =>
    (store.storeNameAr || store.storeName || '').includes(query.trim()) &&
    (filter === 'all' ||
      (filter === 'other'
        ? !['ACTIVE', 'PENDING_APPROVAL'].includes(store.status)
        : store.status === filter));
  return (
    <div className="stack owner-dashboard">
      <div className="owner-intro">
        <div>
          <span className="owner-eyebrow">مساحة عملك</span>
          <h2>كل تفاصيل تجارتك، في مكان واحد</h2>
          <p>تابع حالة متاجرك، رتّب منتجاتك، واستعد لطلباتك القادمة.</p>
        </div>
        <Store size={56} strokeWidth={1.3} aria-hidden="true" />
      </div>
      {state.data && (
        <div className="owner-stats" aria-label="ملخص متاجر الصفحة الحالية">
          <div>
            <span className="owner-stat-icon">
              <Store size={22} />
            </span>
            <span>
              المتاجر في هذه الصفحة<strong>{state.data.length}</strong>
            </span>
          </div>
          <div>
            <span className="owner-stat-icon">
              <CheckCircle2 size={22} />
            </span>
            <span>
              مفتوحة لاستقبال الطلبات
              <strong>
                {
                  state.data.filter((s) => s.status === 'ACTIVE' && s.isOpenNow)
                    .length
                }
              </strong>
            </span>
          </div>
          <div>
            <span className="owner-stat-icon amber">
              <Clock3 size={22} />
            </span>
            <span>
              بانتظار المراجعة
              <strong>
                {
                  state.data.filter((s) => s.status === 'PENDING_APPROVAL')
                    .length
                }
              </strong>
            </span>
          </div>
        </div>
      )}
      <details className="surface padded owner-create">
        <summary>
          <Plus size={20} aria-hidden="true" /> <span>إضافة متجر</span>
        </summary>
        <p>ابدأ ببيانات متجرك وموقعه. بعد الحفظ، يُرسل المتجر للمراجعة.</p>
        <Result state={categories}>
          {(rows) =>
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
        {(rows) => (
          <>
            <div className="owner-section-heading">
              <div>
                <h2>متاجري</h2>
                <p>إدارة المتاجر وحالة ظهورها للعملاء</p>
              </div>
              <button className="secondary" onClick={state.reload}>
                <RefreshCw size={16} /> تحديث
              </button>
            </div>
            <div className="owner-toolbar">
              <label className="owner-search">
                <Search size={18} aria-hidden="true" />
                <input
                  aria-label="البحث في متاجر الصفحة"
                  placeholder="ابحث عن متجر في هذه الصفحة…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="owner-filter">
                حالة المتجر
                <select
                  aria-label="حالة المتجر"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">كل الحالات</option>
                  <option value="ACTIVE">معتمد</option>
                  <option value="PENDING_APPROVAL">بانتظار المراجعة</option>
                  <option value="other">غير نشط أو موقوف</option>
                </select>
              </label>
            </div>
            <div className="owner-store-grid">
              {rows.filter(matchesStore).map((store) => (
                <article
                  key={store.storeId}
                  className="surface padded owner-store-card"
                >
                  <div className="owner-store-top">
                    <span className="owner-store-avatar">
                      <Store size={28} aria-hidden="true" />
                    </span>
                    <span
                      className={`owner-status ${store.status === 'ACTIVE' ? 'is-active' : store.status === 'PENDING_APPROVAL' ? 'is-pending' : ''}`}
                    >
                      {storeStatuses[store.status] || store.status}
                    </span>
                  </div>
                  <h2>{store.storeNameAr || store.storeName}</h2>
                  <p className="owner-store-category">
                    {store.storeCategory?.nameAr ||
                      categories.data?.find(
                        (c) => c.categoryId === store.categoryId,
                      )?.nameAr ||
                      'متجر'}
                  </p>
                  <p className="owner-location">
                    <MapPin size={16} aria-hidden="true" />
                    {[
                      governorates.find((g) => g.id === store.areaId)?.name,
                      store.fullAddressAr || store.fullAddress,
                    ]
                      .filter(Boolean)
                      .join('، ') || 'أضف عنوان متجرك من تعديل البيانات'}
                  </p>
                  <div className="owner-store-note">
                    {store.status === 'ACTIVE' ? (
                      <>
                        <span
                          className={`owner-dot ${store.isOpenNow ? 'is-open' : ''}`}
                        />
                        {store.isOpenNow
                          ? 'مفتوح • يستقبل الطلبات'
                          : 'مغلق • لا يستقبل الطلبات'}
                      </>
                    ) : store.status === 'PENDING_APPROVAL' ? (
                      'يمكنك تجهيز منتجاتك أثناء انتظار تفعيل المتجر.'
                    ) : (
                      'متجرك غير ظاهر للعملاء حاليًا. راجع حالة اعتماده.'
                    )}
                  </div>
                  <button
                    className="owner-products-button"
                    aria-expanded={selected === store.storeId}
                    aria-controls="owner-products"
                    onClick={() =>
                      setSelected(
                        selected === store.storeId ? undefined : store.storeId,
                      )
                    }
                  >
                    <Package size={18} aria-hidden="true" />
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
                      {(rows) => (
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
            {!rows.length && (
              <Empty title="متجرك الأول يبدأ من هنا">
                <p>اختر إضافة متجر، ثم أدخل بياناته لتبدأ تجهيز منتجاتك.</p>
              </Empty>
            )}
            {!!rows.length && !rows.some(matchesStore) && (
              <Empty title="لا توجد متاجر تطابق بحثك">
                <p>جرّب اسمًا آخر أو اختر كل الحالات.</p>
              </Empty>
            )}
            <Pager page={page} more={rows.length === 20} setPage={setPage} />
          </>
        )}
      </Result>
      {selected && (
        <div id="owner-products">
          <Products
            key={selected}
            storeId={selected}
            storeName={
              state.data?.find((s) => s.storeId === selected)?.storeNameAr
            }
          />
        </div>
      )}
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
  const [saved, setSaved] = useState(false);
  return (
    <div className="owner-store-form">
      <ActionForm
        label="حفظ المتجر"
        submit={async (data) => {
          const {
            storeName,
            storeNameAr,
            descriptionAr,
            categoryId,
            areaId,
            fullAddressAr,
          } = Object.fromEntries(data);
          await api(
            store ? `/stores/${store.storeId}` : '/stores',
            json(store ? 'PATCH' : 'POST', {
              storeName,
              storeNameAr,
              descriptionAr,
              categoryId: Number(categoryId),
              areaId: Number(areaId),
              fullAddressAr,
            }),
          );
          setSaved(true);
          reload();
        }}
      >
        <div className="owner-form-heading">
          <span>01</span>
          <div>
            <h3>بيانات المتجر</h3>
            <p>عرّف العملاء على اسم متجرك ونشاطه.</p>
          </div>
        </div>
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
            {categories.map((c) => (
              <option value={c.categoryId} key={c.categoryId}>
                {c.nameAr}
              </option>
            ))}
          </select>
        </label>
        <div className="owner-form-heading">
          <span>02</span>
          <div>
            <h3>موقع المتجر</h3>
            <p>اختر المحافظة وأدخل عنوانًا واضحًا يسهل الوصول إليه.</p>
          </div>
        </div>
        <label>
          المحافظة
          <select
            name="areaId"
            required
            defaultValue={
              governorates.some((item) => item.id === store?.areaId)
                ? store?.areaId
                : ''
            }
          >
            <option value="" disabled>
              اختر المحافظة
            </option>
            {governorates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="العنوان"
          name="fullAddressAr"
          defaultValue={store?.fullAddressAr ?? store?.fullAddress ?? ''}
        />
      </ActionForm>
      {saved && (
        <p className="owner-success" role="status">
          تم حفظ بيانات المتجر بنجاح.
        </p>
      )}
    </div>
  );
}
