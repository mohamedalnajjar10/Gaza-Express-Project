import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Store,
  MapPin,
  Package,
  Plus,
  Clock3,
  CheckCircle2,
  Search,
  RefreshCw,
  Landmark,
  Wallet,
} from 'lucide-react';
import { ApiError, api, json } from '../../shared/api/client';
import Products from './store-products';
import { storeStatuses, type ManagedStore } from './store-status';
import { Empty, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';
import { Pager } from '../../shared/ui/pager';
import { StoreDeliveryPartners } from './delivery-partners';
import { deliveryAreas as governorates } from '../../shared/lib/delivery-areas';
import { money } from '../../shared/lib/money';
import { formatBpsPct, normalizeDigits, PLATFORM_BANK_PHONE } from '../../shared/lib/numbers';
import { AddressMap } from '../addresses/address-map';
import '../addresses/addresses.css';
import '../orders/payment.css';

export default function OwnerStores() {
  const [params] = useSearchParams();
  return params.get('tab') === 'finance' ? <MerchantFinance /> : <OwnerStoresDirectory />;
}

function OwnerStoresDirectory() {
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
  const normalizedQuery = normalizeDigits(query.trim()).toLowerCase();
  const matchesStore = (store: ManagedStore) =>
    (!normalizedQuery ||
      normalizeDigits(`${store.storeNameAr ?? ''} ${store.storeName ?? ''} ${store.fullAddressAr ?? ''}`)
        .toLowerCase()
        .includes(normalizedQuery)) &&
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
              <div className="owner-heading-actions">
                <Link className="secondary button" to="/operations?tab=finance">
                  <Wallet size={16} aria-hidden="true" /> الأرباح والعمولات
                </Link>
                <button className="secondary" onClick={state.reload}>
                  <RefreshCw size={16} /> تحديث
                </button>
              </div>
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
            {(normalizedQuery || filter !== 'all') && (
              <p role="status">
                يعرض {rows.filter(matchesStore).length} من أصل {rows.length} متجر في هذه الصفحة.
              </p>
            )}
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
                    {' · '}
                    <span className={`plan-badge ${store.planTier === 'PRO' ? 'is-pro' : ''}`}>
                      {store.planTier === 'PRO' ? 'باقة PRO' : 'الباقة المجانية'}
                    </span>
                  </p>
                  {(store.deliveryBaseFee != null || store.deliveryPerKmFee != null || store.freeDeliveryThreshold != null) && (
                    <p className="owner-store-category">
                      توصيل: {money(store.deliveryBaseFee ?? 0)}
                      {Number(store.deliveryPerKmFee ?? 0) > 0 ? ` + ${money(store.deliveryPerKmFee ?? 0)} / كم` : ''}
                      {store.freeDeliveryThreshold != null ? ` · مجاني فوق ${money(store.freeDeliveryThreshold)}` : ''}
                    </p>
                  )}
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
                  <div className="owner-bank-chip">
                    <Landmark size={15} aria-hidden="true" />
                    <span>
                      بنك فلسطين:{' '}
                      <strong dir="ltr">{store.bankTransferPhone || PLATFORM_BANK_PHONE}</strong>{' '}
                      ({store.bankTransferPhone && store.bankTransferPhone !== PLATFORM_BANK_PHONE ? 'رقم المتجر' : 'رقم المنصة الافتراضي'})
                    </span>
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
                        await api(`/stores/${store.storeId}/toggle-status`, json('PATCH', { isOpenNow: !store.isOpenNow }));
                        state.reload();
                      }}
                    />
                  )}
                  <StoreDeliveryPartners storeId={store.storeId} />
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
  const [latText, setLatText] = useState(String(store?.latitude ?? ''));
  const [lngText, setLngText] = useState(String(store?.longitude ?? ''));
  const addressRef = useRef<HTMLInputElement>(null);

  const parsedLat = Number(normalizeDigits(latText.trim()));
  const parsedLng = Number(normalizeDigits(lngText.trim()));
  const mapPoint =
    latText.trim() !== '' &&
    lngText.trim() !== '' &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    Math.abs(parsedLat) <= 90 &&
    Math.abs(parsedLng) <= 180
      ? { lat: parsedLat, lng: parsedLng }
      : undefined;

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
            latitude,
            longitude,
            deliveryRangeKm,
            deliveryBaseFee,
            deliveryPerKmFee,
            freeDeliveryThreshold,
          } = Object.fromEntries(data);
          const latClean = normalizeDigits(String(latitude ?? '')).trim();
          const lngClean = normalizeDigits(String(longitude ?? '')).trim();
          const hasLatitude = latClean !== '';
          const hasLongitude = lngClean !== '';
          if (hasLatitude !== hasLongitude) throw new ApiError(400, 'أدخل خط العرض وخط الطول معاً لتحديد موقع المتجر.');
          const latNum = hasLatitude ? Number(latClean) : null;
          const lngNum = hasLongitude ? Number(lngClean) : null;
          if (hasLatitude && (!Number.isFinite(latNum) || Math.abs(latNum!) > 90 || !Number.isFinite(lngNum) || Math.abs(lngNum!) > 180)) {
            throw new ApiError(400, 'أدخل إحداثيات صالحة لخط العرض وخط الطول.');
          }
          const numOrNull = (raw: FormDataEntryValue | undefined) => {
            const text = normalizeDigits(String(raw ?? '')).trim();
            return text === '' ? null : Number(text);
          };
          const baseFeeVal = numOrNull(deliveryBaseFee);
          const perKmVal = numOrNull(deliveryPerKmFee);
          const freeThresholdVal = numOrNull(freeDeliveryThreshold);
          const rangeText = normalizeDigits(String(deliveryRangeKm ?? '')).trim();
          const bankPhone = normalizeDigits(String(data.get('bankTransferPhone') ?? '')).trim();
          const hadCoords = store?.latitude != null || store?.longitude != null;
          await api(
            store ? `/stores/${store.storeId}` : '/stores',
            json(store ? 'PATCH' : 'POST', {
              storeName,
              storeNameAr,
              descriptionAr,
              bankTransferPhone: bankPhone || null,
              categoryId: Number(categoryId),
              areaId: Number(areaId),
              fullAddressAr,
              ...(hasLatitude
                ? { latitude: latNum, longitude: lngNum }
                : store && hadCoords
                  ? { latitude: null, longitude: null }
                  : {}),
              ...(rangeText && { deliveryRangeKm: Number(rangeText) }),
              ...(baseFeeVal !== null || store?.deliveryBaseFee != null ? { deliveryBaseFee: baseFeeVal } : {}),
              ...(perKmVal !== null || store?.deliveryPerKmFee != null ? { deliveryPerKmFee: perKmVal } : {}),
              ...(freeThresholdVal !== null || store?.freeDeliveryThreshold != null ? { freeDeliveryThreshold: freeThresholdVal } : {}),
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
            <p>اختر المحافظة وأدخل عنوانًا واضحًا، ثم حدّد موقع المتجر على الخريطة أو بالإحداثيات.</p>
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
        <label>
          العنوان
          <input
            ref={addressRef}
            name="fullAddressAr"
            type="text"
            required
            defaultValue={store?.fullAddressAr ?? store?.fullAddress ?? ''}
          />
        </label>
        <div className="owner-field-full">
          <AddressMap
            point={mapPoint}
            onChange={(next) => {
              setLatText(String(next.lat));
              setLngText(String(next.lng));
            }}
            onArea={(_area, street) => {
              if (street && addressRef.current && !addressRef.current.value.trim()) {
                addressRef.current.value = street;
              }
            }}
          />
          <small>
            حرّك الخريطة أو استخدم «موقعي الحالي»، أو أدخل خط العرض والطول يدويًا. يُحسب نطاق التوصيل من هذا الموقع إلى عنوان العميل.
          </small>
        </div>
        <label>
          خط العرض للمتجر
          <input
            name="latitude"
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={latText}
            onChange={(e) => setLatText(e.target.value)}
          />
        </label>
        <label>
          خط الطول للمتجر
          <input
            name="longitude"
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={lngText}
            onChange={(e) => setLngText(e.target.value)}
          />
        </label>
        {(latText || lngText) && (
          <div className="owner-field-full">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setLatText('');
                setLngText('');
              }}
            >
              مسح إحداثيات الموقع
            </button>
          </div>
        )}
        <Field label="نطاق التوصيل بالكيلومتر" name="deliveryRangeKm" type="number" min={0} max={999.99} step="0.01" defaultValue={String(store?.deliveryRangeKm ?? 10)} />
        <div className="owner-form-heading">
          <span>03</span>
          <div>
            <h3>إعدادات الدفع — بنك فلسطين</h3>
            <p>ضع رقم التحويل الخاص بمتجرك، أو اتركه فارغاً لاستخدام رقم المنصة.</p>
          </div>
        </div>
        <div className="owner-field-full">
          <Field
            label="رقم التحويل عبر بنك فلسطين"
            name="bankTransferPhone"
            type="tel"
            pattern="0(59|56)[0-9٠-٩۰-۹]{7}"
            defaultValue={store?.bankTransferPhone ?? ''}
            required={false}
          />
          <small>
            صيغة الرقم: 10 أرقام تبدأ بـ 059 أو 056. عند تركه فارغاً يُستخدم رقم المنصة المعتمد <strong dir="ltr">{PLATFORM_BANK_PHONE}</strong>، وعند تخصيصه يمكنك التحقق من وصول الحوالات ومطابقتها مباشرة.
          </small>
        </div>
        <div className="owner-form-heading">
          <span>04</span>
          <div>
            <h3>تسعير التوصيل والحد المجاني</h3>
            <p>حدّد رسوم التوصيل الخاصة بمتجرك، أو اتركها فارغة لاستخدام الإعدادات الافتراضية.</p>
          </div>
        </div>
        <Field label="رسوم التوصيل الأساسية (شيكل)" name="deliveryBaseFee" type="number" min={0} max={1000} step="0.01" defaultValue={String(store?.deliveryBaseFee ?? '')} required={false} />
        <Field label="رسوم التوصيل لكل كيلومتر (شيكل)" name="deliveryPerKmFee" type="number" min={0} max={500} step="0.01" defaultValue={String(store?.deliveryPerKmFee ?? '')} required={false} />
        <div className="owner-field-full">
          <Field label="حد التوصيل المجاني بالشيكل (اختياري)" name="freeDeliveryThreshold" type="number" min={0} max={100000} step="0.01" defaultValue={String(store?.freeDeliveryThreshold ?? '')} required={false} />
        </div>
      </ActionForm>
      {saved && (
        <p className="owner-success" role="status">
          تم حفظ بيانات المتجر بنجاح.
        </p>
      )}
    </div>
  );
}

type MerchantSummary = {
  totals: {
    totalOrders: number;
    deliveredOrders: number;
    bankTransferOrders: number;
    cashOrders: number;
    grossSales: string;
    netStoreEarnings: string;
    platformFees: string;
    deliveryFeesTotal: string;
    pendingStorePayout: string;
    pendingDirectBankHandover: string;
  };
  config: {
    defaultCommissionBps: number;
    proCommissionDiscountBps: number;
    bankTransferPointsPerOrder: number;
    cashPointsPerOrder: number;
  };
  stores: {
    storeId: number;
    storeName: string;
    storeNameAr: string;
    status: string;
    planTier: 'FREE' | 'PRO';
    commissionBps: number | null;
    categoryNameAr: string;
    effectiveCommissionBps: number;
    deliveredOrders: number;
    grossSales: string;
    netEarnings: string;
    platformFees: string;
  }[];
};

function MerchantFinance() {
  const state = useResource(
    signal => api<MerchantSummary>('/finance/merchant-summary', { signal }),
    'merchant-finance-summary',
  );
  return (
    <div className="stack owner-dashboard">
      <div className="owner-section-heading">
        <div>
          <h2>ملخص الأرباح والعمولات</h2>
          <p>إجمالي المبيعات المسلمة، صافي مستحقات متاجرك، والباقة المطبقة لكل متجر.</p>
        </div>
        <div className="owner-heading-actions">
          <Link className="secondary button" to="/operations">العودة إلى متاجري</Link>
          <button type="button" className="secondary" onClick={state.reload}>
            <RefreshCw size={16} /> تحديث
          </button>
        </div>
      </div>
      <Result state={state}>
        {summary => (
          <>
            <div className="business-kpis">
              <article className="surface padded">
                <span>إجمالي المبيعات المُسلّمة</span>
                <strong>{money(summary.totals.grossSales)}</strong>
              </article>
              <article className="surface padded">
                <span>صافي مستحقات المتاجر</span>
                <strong>{money(summary.totals.netStoreEarnings)}</strong>
              </article>
              <article className="surface padded">
                <span>عمولات ورسوم المنصة</span>
                <strong>{money(summary.totals.platformFees)}</strong>
              </article>
              <article className="surface padded">
                <span>بانتظار التسوية والتحويل</span>
                <strong>{money(summary.totals.pendingStorePayout)}</strong>
              </article>
            </div>
            <div className="surface padded stack">
              <div className="bop-receipt-meta">
                <span>إجمالي الطلبات: {summary.totals.totalOrders}</span>
                <span>الطلبات المُسلّمة: {summary.totals.deliveredOrders}</span>
                <span>طلبات بنك فلسطين: {summary.totals.bankTransferOrders}</span>
                <span>طلبات نقدية: {summary.totals.cashOrders}</span>
                <span>إجمالي رسوم التوصيل: {money(summary.totals.deliveryFeesTotal)}</span>
                {Number(summary.totals.pendingDirectBankHandover) > 0 && (
                  <span>حوالات مباشرة بحاجة لتوريد/تسوية: {money(summary.totals.pendingDirectBankHandover)}</span>
                )}
              </div>
              <small>
                يحصل العملاء على {summary.config.bankTransferPointsPerOrder} نقطة ولاء عند الدفع عبر بنك فلسطين مقابل {summary.config.cashPointsPerOrder} نقاط للدفع عند الاستلام.
              </small>
            </div>
            <div className="owner-store-grid">
              {summary.stores.map(store => (
                <article key={store.storeId} className="surface padded stack">
                  <div className="owner-store-top">
                    <h3>{store.storeNameAr || store.storeName}</h3>
                    <span className={`plan-badge ${store.planTier === 'PRO' ? 'is-pro' : ''}`}>
                      {store.planTier === 'PRO' ? 'باقة PRO' : 'الباقة المجانية'}
                    </span>
                  </div>
                  <p className="owner-store-category">
                    {store.categoryNameAr} · العمولة المطبقة: {formatBpsPct(store.effectiveCommissionBps)} ({store.effectiveCommissionBps} نقطة أساس)
                  </p>
                  <div className="bop-receipt-meta">
                    <span>الطلبات المُسلّمة: {store.deliveredOrders}</span>
                    <span>المبيعات: {money(store.grossSales)}</span>
                    <span>صافي أرباحك: {money(store.netEarnings)}</span>
                    <span>رسوم المنصة: {money(store.platformFees)}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Result>
    </div>
  );
}
