import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, json } from '../../shared/api/client';
import { storeStatuses } from './store-status';
import { Empty, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';
import { money } from '../../shared/lib/money';
import { formatBpsPct } from '../../shared/lib/numbers';

type PlatformSummary = {
  config: {
    defaultCommissionBps: number;
    proCommissionDiscountBps: number;
    deliveryBaseFeeIls: string;
    deliveryPerKmFeeIls: string;
    deliveryPlatformCutBps: number;
    driverFeeIls: string;
    platformBankPhone?: string;
  };
  totals: {
    totalStores: number;
    activeStores: number;
    proStores: number;
    freeStores: number;
    deliveredOrders: number;
    activeOrders: number;
    bankTransferOrders: number;
    cashOrders: number;
    pendingSettlementOrders: number;
    grossMerchandiseValue: string;
    totalDeliveryFees: string;
    totalPlatformRevenue: string;
    totalStorePayouts: string;
    totalDriverPayouts: string;
    totalCompanyFees: string;
  };
  categories: {
    categoryId: number;
    nameAr: string;
    nameEn?: string | null;
    defaultCommissionBps: number | null;
    storeCount: number;
  }[];
  stores: {
    storeId: number;
    storeName: string;
    storeNameAr: string;
    status: string;
    planTier: 'FREE' | 'PRO';
    commissionBps: number | null;
    categoryNameAr: string;
    categoryDefaultCommissionBps: number | null;
    effectiveCommissionBps: number;
    totalOrders: number;
  }[];
  pendingSettlementOrdersList?: {
    orderId: number;
    storeNameAr: string;
    amount: string;
    method: string;
    needsHandover: boolean;
    needsStorePayout: boolean;
    needsDriverPayout: boolean;
  }[];
};

export function BusinessModelPanel() {
  const state = useResource(
    signal => api<PlatformSummary>('/finance/platform-summary', { signal }),
    'admin-business-summary',
  );
  const [notice, setNotice] = useState('');
  return (
    <div className="stack">
      <div className="owner-section-heading">
        <p>إدارة عمولات الفئات، باقات المتاجر (FREE / PRO)، ومؤشرات الأرباح والتسويات.</p>
        <button type="button" className="secondary" onClick={state.reload}>تحديث البيانات</button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <Result state={state}>
        {summary => (
          <>
            <div className="business-kpis">
              <article className="surface padded">
                <span>إجمالي قيمة الطلبات (GMV)</span>
                <strong>{money(summary.totals.grossMerchandiseValue)}</strong>
              </article>
              <article className="surface padded">
                <span>صافي إيرادات المنصة</span>
                <strong>{money(summary.totals.totalPlatformRevenue)}</strong>
              </article>
              <article className="surface padded">
                <span>مستحقات المتاجر</span>
                <strong>{money(summary.totals.totalStorePayouts)}</strong>
              </article>
              <article className="surface padded">
                <span>مستحقات السائقين</span>
                <strong>{money(summary.totals.totalDriverPayouts)}</strong>
              </article>
            </div>
            <section className="surface padded stack">
              <div className="bop-receipt-meta">
                <span>المتاجر النشطة: {summary.totals.activeStores} / {summary.totals.totalStores}</span>
                <span>باقة PRO: {summary.totals.proStores} · المجانية: {summary.totals.freeStores}</span>
                <span>الطلبات المُسلّمة: {summary.totals.deliveredOrders} · النشطة: {summary.totals.activeOrders}</span>
                <span>بنك فلسطين: {summary.totals.bankTransferOrders} · نقدي: {summary.totals.cashOrders}</span>
                <span>إجمالي رسوم التوصيل: {money(summary.totals.totalDeliveryFees)}</span>
                <span>رسوم شركات التوصيل: {money(summary.totals.totalCompanyFees)}</span>
                <span>طلبات بانتظار التسوية: {summary.totals.pendingSettlementOrders}</span>
              </div>
              <small>
                الإعدادات العامة الافتراضية: العمولة {formatBpsPct(summary.config.defaultCommissionBps)}
                {' · '}خصم PRO {formatBpsPct(summary.config.proCommissionDiscountBps)}
                {' · '}حصة المنصة من التوصيل {formatBpsPct(summary.config.deliveryPlatformCutBps)}
                {' · '}توصيل افتراضي {money(summary.config.deliveryBaseFeeIls)} + {money(summary.config.deliveryPerKmFeeIls)}/كم
                {summary.config.platformBankPhone && (
                  <>
                    {' · '}رقم التحويل الافتراضي: <bdi dir="ltr">{summary.config.platformBankPhone}</bdi>
                  </>
                )}
              </small>
            </section>
            {!!summary.pendingSettlementOrdersList?.length && (
              <section className="stack">
                <h3>طلبات مُسلّمة بانتظار التسوية</h3>
                <div className="stack">
                  {summary.pendingSettlementOrdersList.map(item => (
                    <Link
                      key={item.orderId}
                      to={`/orders/${item.orderId}`}
                      className="surface padded list-row"
                    >
                      <div>
                        <strong>طلب #{item.orderId} · {item.storeNameAr}</strong>
                        <p>
                          {money(item.amount)} ·{' '}
                          {item.method === 'BANK_TRANSFER' ? 'بنك فلسطين' : 'نقدي'}
                        </p>
                      </div>
                      <div className="bop-receipt-meta">
                        {item.needsHandover && <span>بانتظار توريد النقد</span>}
                        {item.needsStorePayout && <span>بانتظار صرف المتجر</span>}
                        {item.needsDriverPayout && <span>بانتظار صرف السائق</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section className="stack">
              <h3>عمولات التصنيفات</h3>
              {summary.categories.length ? (
                <div className="business-grid">
                  {summary.categories.map(category => (
                    <article key={category.categoryId} className="surface padded stack">
                      <div className="admin-user-head">
                        <strong>{category.nameAr}</strong>
                        <span>{category.storeCount} متجر</span>
                      </div>
                      <small>
                        العمولة الحالية:{' '}
                        {category.defaultCommissionBps !== null
                          ? `${formatBpsPct(category.defaultCommissionBps)} (${category.defaultCommissionBps} نقطة أساس)`
                          : 'الافتراضي العام للمنصة'}
                      </small>
                      <ActionForm
                        label="حفظ عمولة التصنيف"
                        submit={async fields => {
                          const raw = String(fields.get('defaultCommissionPct') ?? '').trim();
                          await api(`/store-categories/${category.categoryId}`, json('PATCH', {
                            defaultCommissionBps: raw === '' ? null : Math.round(Number(raw) * 100),
                          }));
                          setNotice(`تم تحديث عمولة تصنيف «${category.nameAr}».`);
                          state.reload();
                        }}
                      >
                        <Field
                          label="النسبة (٪ - اتركه فارغاً للافتراضي)"
                          name="defaultCommissionPct"
                          type="number"
                          min={0}
                          max={50}
                          step="0.01"
                          defaultValue={category.defaultCommissionBps !== null ? String(category.defaultCommissionBps / 100) : ''}
                          required={false}
                        />
                      </ActionForm>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="لا توجد تصنيفات متاجر بعد" />
              )}
            </section>
            <section className="stack">
              <h3>باقات المتاجر (FREE / PRO) والعمولات المخصصة</h3>
              {summary.stores.length ? (
                <div className="business-grid">
                  {summary.stores.map(store => (
                    <article key={store.storeId} className="surface padded stack">
                      <div className="admin-user-head">
                        <div>
                          <strong>{store.storeNameAr || store.storeName}</strong>
                          <p>{store.categoryNameAr} · {storeStatuses[store.status] || store.status}</p>
                        </div>
                        <span className={`plan-badge ${store.planTier === 'PRO' ? 'is-pro' : ''}`}>
                          {store.planTier === 'PRO' ? 'PRO' : 'FREE'}
                        </span>
                      </div>
                      <small>
                        العمولة الفعلية: {formatBpsPct(store.effectiveCommissionBps)}
                        {store.commissionBps !== null ? ' (مخصصة للمتجر)' : ' (من التصنيف/الباقة)'}
                      </small>
                      <ActionForm
                        label="حفظ باقة المتجر"
                        submit={async fields => {
                          const pctRaw = String(fields.get('commissionPct') ?? '').trim();
                          await api(`/stores/${store.storeId}/monetization`, json('PATCH', {
                            planTier: fields.get('planTier'),
                            commissionBps: pctRaw === '' ? null : Math.round(Number(pctRaw) * 100),
                          }));
                          setNotice(`تم تحديث باقة وعمولة «${store.storeNameAr || store.storeName}».`);
                          state.reload();
                        }}
                      >
                        <label>
                          الباقة
                          <select name="planTier" defaultValue={store.planTier}>
                            <option value="FREE">الباقة المجانية (FREE)</option>
                            <option value="PRO">باقة الشركاء (PRO)</option>
                          </select>
                        </label>
                        <Field
                          label="عمولة مخصصة للمتجر (٪ - اختياري)"
                          name="commissionPct"
                          type="number"
                          min={0}
                          max={50}
                          step="0.01"
                          defaultValue={store.commissionBps !== null ? String(store.commissionBps / 100) : ''}
                          required={false}
                        />
                      </ActionForm>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="لا توجد متاجر مسجلة بعد" />
              )}
            </section>
          </>
        )}
      </Result>
    </div>
  );
}
