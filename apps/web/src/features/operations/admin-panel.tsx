import { deliveryAreas as governorates } from '../../shared/lib/delivery-areas';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, json } from '../../shared/api/client';
import { storeStatuses, transitions, type ManagedStore } from './store-status';
import { type Profile } from '../../shared/auth/types';
import { Empty, ErrorBox, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';
import { Pager } from '../../shared/ui/pager';
import { normalizeDigits } from '../../shared/lib/numbers';
import { BusinessModelPanel } from './admin-business';
import { FraudReports } from './admin-receipts';
import '../orders/payment.css';

const roleLabels: Record<string, string> = {
  customer: 'عميل',
  store_owner: 'صاحب متجر',
  driver: 'سائق',
  admin: 'مدير',
};

export default function Admin() {
  const [params] = useSearchParams();
  switch (params.get('tab')) {
    case 'business': return <><h2>نموذج العمل والعمولات والأرباح</h2><BusinessModelPanel /></>;
    case 'fraud': return <><h2>بلاغات الاحتيال ومراجعة الإيصالات</h2><FraudReports /></>;
    case 'categories': return <StoreCategories />;
    case 'users': return <><h2>الحسابات والسائقون</h2><Users /></>;
    case 'sms': return <Sms />;
    default: return <><h2>مراجعة المتاجر</h2><Moderation /></>;
  }
}

function StoreCategories() {
  const [created, setCreated] = useState('');

  return (
    <section className="surface padded narrow">
      <h2>إضافة تصنيف متجر</h2>
      <ActionForm
        key={created}
        label="حفظ التصنيف"
        submit={async fields => {
          const nameAr = String(fields.get('nameAr')).trim();
          const nameEn = String(fields.get('nameEn')).trim();
          const pctRaw = String(fields.get('defaultCommissionPct') ?? '').trim();
          await api(
            '/store-categories',
            json('POST', {
              nameAr,
              ...(nameEn && { nameEn }),
              ...(pctRaw !== '' && { defaultCommissionBps: Math.round(Number(pctRaw) * 100) }),
            }),
          );
          setCreated(nameAr);
        }}
      >
        <Field
          label="اسم التصنيف بالعربية"
          name="nameAr"
          pattern={String.raw`.*\S.*`}
          maxLength={191}
        />
        <Field
          label="اسم التصنيف بالإنجليزية"
          name="nameEn"
          maxLength={191}
          required={false}
        />
        <Field
          label="نسبة العمولة الافتراضية (٪ - اختياري)"
          name="defaultCommissionPct"
          type="number"
          min={0}
          max={50}
          step="0.01"
          required={false}
        />
      </ActionForm>
      {created && <p role="status">تم حفظ التصنيف «{created}».</p>}
    </section>
  );
}

function Moderation() {
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const [page, setPage] = useState(1);
  const state = useResource(
    signal =>
      api<ManagedStore[]>(
        `/stores/moderation?status=${status}&limit=20&page=${page}`,
        { signal },
      ),
    `moderation:${status}:${page}`,
  );
  return (
    <div className="stack">
      <label>
        حالة المتجر
        <select
          value={status}
          onChange={e => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {Object.entries(storeStatuses).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Result state={state}>
        {rows => (
          <>
            {rows.map(store => {
              const areaName = governorates.find(g => g.id === store.areaId)?.name;
              const addressText = [areaName, store.fullAddressAr || store.fullAddress].filter(Boolean).join('، ');
              return (
                <article className="surface padded stack" key={store.storeId}>
                  <div className="admin-user-head">
                    <div>
                      <h2>{store.storeNameAr || store.storeName}</h2>
                      <div className="bop-receipt-meta">
                        {store.storeCategory?.nameAr && <span>التصنيف: {store.storeCategory.nameAr}</span>}
                        {addressText && <span>العنوان: {addressText}</span>}
                        {store.phone && <span>الهاتف: <bdi dir="ltr">{store.phone}</bdi></span>}
                      </div>
                    </div>
                    {store.planTier && (
                      <span className={`plan-badge ${store.planTier === 'PRO' ? 'is-pro' : ''}`}>
                        {store.planTier === 'PRO' ? 'PRO' : 'FREE'}
                      </span>
                    )}
                  </div>
                  <ActionForm
                    label="تحديث الاعتماد"
                    submit={async fields => {
                      await api(
                        `/stores/${store.storeId}/moderation`,
                        json('PATCH', {
                          expectedStatus: store.status,
                          ...Object.fromEntries(fields),
                        }),
                      );
                      state.reload();
                    }}
                  >
                    <label>
                      الحالة الجديدة
                      <select name="status">
                        {transitions[store.status]?.map(s => (
                          <option value={s} key={s}>
                            {storeStatuses[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="سبب القرار" name="reason" maxLength={500} />
                  </ActionForm>
                </article>
              );
            })}
            {!rows.length && <Empty title="لا توجد متاجر بهذه الحالة" />}
            <Pager page={page} more={rows.length === 20} setPage={setPage} />
          </>
        )}
      </Result>
    </div>
  );
}

type UserRow = Profile & { is_active?: boolean; is_verified?: boolean };

function Users() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [pendingUser, setPendingUser] = useState<UserRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<unknown>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const state = useResource(
    signal => api<UserRow[]>(`/users?page=${page}&limit=20`, { signal }),
    `users:${page}`,
  );
  const [notice, setNotice] = useState('');

  async function confirmUserStatusChange() {
    if (!pendingUser || submitting) return;
    setSubmitting(true);
    setDialogError(undefined);
    try {
      if (pendingUser.is_active === false) {
        await api(`/users/${pendingUser.user_id}`, json('PATCH', { is_active: true }));
        setNotice(`تمت إعادة تفعيل الحساب #${pendingUser.user_id}`);
      } else {
        await api(`/users/${pendingUser.user_id}`, { method: 'DELETE' });
        setNotice(`تم تعطيل الحساب #${pendingUser.user_id} وإلغاء جلساته`);
      }
      dialogRef.current?.close();
      setPendingUser(null);
      state.reload();
    } catch (error) {
      setDialogError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Result state={state}>
      {rows => {
        const normalizedQuery = normalizeDigits(query.trim()).toLowerCase();
        const filtered = rows.filter(user =>
          (roleFilter === 'all' || user.role === roleFilter) &&
          (!normalizedQuery ||
            normalizeDigits(`${user.user_id} ${user.full_name} ${user.phone ?? ''} ${user.email ?? ''}`)
              .toLowerCase()
              .includes(normalizedQuery)),
        );
        return (
          <>
            {notice && <p role="status">{notice}</p>}
            <div className="owner-toolbar">
              <label className="owner-search">
                <Search size={18} aria-hidden="true" />
                <input
                  aria-label="البحث في الحسابات"
                  placeholder="الاسم أو الرقم أو الهاتف أو البريد…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
              <label className="owner-filter">
                الدور
                <select
                  aria-label="تصفية حسب الدور"
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value)}
                >
                  <option value="all">كل الأدوار</option>
                  <option value="customer">عميل</option>
                  <option value="store_owner">صاحب متجر</option>
                  <option value="driver">سائق</option>
                  <option value="admin">مدير</option>
                </select>
              </label>
            </div>
            {(normalizedQuery || roleFilter !== 'all') && (
              <p role="status">يعرض {filtered.length} من أصل {rows.length} حساب في هذه الصفحة.</p>
            )}
            <div className="stack">
              {filtered.map(user => (
                <article className="surface padded stack" key={user.user_id}>
                  <div className="admin-user-head">
                    <div>
                      <h2>
                        {user.full_name} · #{user.user_id}
                      </h2>
                      <p>
                        {roleLabels[user.role] ?? user.role}
                        {user.phone ? <> · <bdi dir="ltr">{user.phone}</bdi></> : null}
                        {user.email ? ` · ${user.email}` : ''}
                      </p>
                    </div>
                    <span className={`payment-badge ${user.is_active === false ? 'is-fraud' : 'is-paid'}`}>
                      {user.is_active === false ? 'حساب معطّل' : 'حساب نشط'}
                    </span>
                  </div>
                  {user.role === 'driver' && (
                    <ActionForm
                      label="حفظ حالة الاعتماد"
                      submit={async fields => {
                        await api(
                          `/drivers/${user.user_id}/approval`,
                          json('PATCH', {
                            approved: fields.get('approval') === 'true',
                          }),
                        );
                        setNotice(`تم تحديث اعتماد السائق #${user.user_id}`);
                        state.reload();
                      }}
                    >
                      <label>
                        الاعتماد
                        <select name="approval" defaultValue={String(user.driverProfile?.approved ?? false)}>
                          <option value="true">معتمد</option>
                          <option value="false">غير معتمد</option>
                        </select>
                      </label>
                    </ActionForm>
                  )}
                  {user.role !== 'admin' && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setPendingUser(user);
                        setDialogError(undefined);
                        dialogRef.current?.showModal();
                      }}
                    >
                      {user.is_active === false ? 'إعادة تفعيل الحساب' : 'تعطيل الحساب'}
                    </button>
                  )}
                </article>
              ))}
              {!filtered.length && <Empty title="لا توجد حسابات تطابق التصفية" />}
            </div>
            <dialog ref={dialogRef} className="admin-dialog" aria-labelledby="user-status-dialog-title">
              <h3 id="user-status-dialog-title">
                {pendingUser?.is_active === false ? 'تأكيد إعادة تفعيل الحساب' : 'تأكيد تعطيل الحساب'}
              </h3>
              {pendingUser && (
                <p>
                  {pendingUser.is_active === false
                    ? `هل تريد إعادة تفعيل حساب «${pendingUser.full_name}» (#${pendingUser.user_id})؟`
                    : `هل أنت متأكد من تعطيل حساب «${pendingUser.full_name}» (#${pendingUser.user_id})؟ سيتم إلغاء جميع جلساته النشطة فورًا.`}
                </p>
              )}
              {dialogError ? <ErrorBox error={dialogError} /> : null}
              <div className="admin-dialog-actions">
                <button type="button" disabled={submitting} onClick={() => void confirmUserStatusChange()}>
                  {submitting
                    ? 'جارٍ التنفيذ…'
                    : pendingUser?.is_active === false
                      ? 'تأكيد التفعيل'
                      : 'تأكيد التعطيل'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={submitting}
                  onClick={() => dialogRef.current?.close()}
                >
                  إلغاء
                </button>
              </div>
            </dialog>
            <Pager page={page} more={rows.length === 20} setPage={setPage} />
          </>
        );
      }}
    </Result>
  );
}

function Sms() {
  const state = useResource(
    signal =>
      api<{
        counts: { status: string; _count: { _all: number } }[];
        recentFailures: {
          id: number;
          status: string;
          attempts: number;
          errorCode?: string;
        }[];
      }>('/notifications/sms-queue', { signal }),
    'sms-queue',
  );
  return (
    <section className="surface padded">
      <button className="secondary" onClick={state.reload}>
        تحديث الطابور
      </button>
      <Result state={state}>
        {value => (
          <>
            <h2>حالة الرسائل</h2>
            <ul>
              {value.counts.map(item => (
                <li key={item.status}>
                  {item.status} · {item._count._all}
                </li>
              ))}
            </ul>
            <h2>آخر حالات الفشل</h2>
            {value.recentFailures.length ? (
              <ul>
                {value.recentFailures.map(item => (
                  <li key={item.id}>
                    #{item.id} · {item.status} · {item.attempts} محاولات{' '}
                    {item.errorCode}
                  </li>
                ))}
              </ul>
            ) : (
              <p>لا توجد حالات فشل حديثة.</p>
            )}
          </>
        )}
      </Result>
    </section>
  );
}
