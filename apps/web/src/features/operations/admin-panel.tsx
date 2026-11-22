import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, json } from '../../shared/api/client';
import { storeStatuses, transitions, type ManagedStore } from './store-status';
import { type Profile } from '../../shared/auth/types';
import { Empty, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';
import { Pager } from '../../shared/ui/pager';

export default function Admin() {
  const [params] = useSearchParams();
  switch (params.get('tab')) {
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
          await api(
            '/store-categories',
            json('POST', {
              nameAr,
              ...(nameEn && { nameEn }),
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
            {rows.map(store => (
              <article className="surface padded" key={store.storeId}>
                <h2>{store.storeNameAr || store.storeName}</h2>
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
            ))}
            {!rows.length && <Empty title="لا توجد متاجر بهذه الحالة" />}
            <Pager page={page} more={rows.length === 20} setPage={setPage} />
          </>
        )}
      </Result>
    </div>
  );
}

function Users() {
  const [page, setPage] = useState(1);
  const state = useResource(
    signal => api<Profile[]>(`/users?page=${page}&limit=20`, { signal }),
    `users:${page}`,
  );
  const [notice, setNotice] = useState('');
  return (
    <Result state={state}>
      {rows => (
        <>
          <p role="status">{notice}</p>
          <div className="stack">
            {rows.map(user => (
              <article className="surface padded" key={user.user_id}>
                <h2>
                  {user.full_name} · #{user.user_id}
                </h2>
                <p>{user.role}</p>
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
              </article>
            ))}
          </div>
          <Pager page={page} more={rows.length === 20} setPage={setPage} />
        </>
      )}
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
