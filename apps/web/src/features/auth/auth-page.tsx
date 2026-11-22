import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, ShoppingBag } from 'lucide-react';
import { ApiError, api, json } from '../../shared/api/client';
import { type Session } from '../../shared/auth/types';
import { useIdentity } from '../../shared/auth/identity';
import { ActionForm, Field } from '../../shared/ui/form';
import { ErrorBox } from '../../shared/ui/feedback';

type Mode = 'login' | 'register' | 'verify' | 'google' | 'error';
export default function Auth({ mode }: { mode: Mode }) {
  const { establish } = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const from = location.state?.from;
  const destination =
    typeof from === 'string' && /^\/(?!\/)/.test(from) ? from : '/';
  const knownPhone =
    typeof location.state?.phone === 'string' ? location.state.phone : '';
  useEffect(() => {
    if (mode === 'google')
      void api<{ tokens: Session }>(
        '/auth/google/exchange',
        { method: 'POST' },
        false,
      )
        .then(({ tokens }) => establish(tokens))
        .then(profile => navigate(profile.role === 'customer' ? '/' : '/operations', { replace: true }), setError);
  }, [mode]);
  async function submit(form: FormData) {
    const phone = String(form.get('phone')).trim();
    if (mode === 'register') {
      await api(
        '/auth/register',
        json('POST', {
          phone,
        }),
        false,
      );
      navigate('/verify', { state: { phone, from: destination } });
      return;
    }
    const { tokens } = await api<{ tokens: Session }>(
      mode === 'verify' ? '/auth/verify-otp' : '/auth/login',
      json(
        'POST',
        mode === 'verify'
          ? { phone, code: form.get('code'), full_name: String(form.get('full_name')).trim(), password: form.get('password'), role: form.get('role') }
          : { phone, password: form.get('password') },
      ),
      false,
    ).catch(error => {
      if (
        mode === 'login' &&
        error instanceof ApiError &&
        error.status === 401
      ) {
        throw new ApiError(400, 'رقم الهاتف أو كلمة المرور غير صحيحة.');
      }
      throw error;
    });
    const profile = await establish(tokens);
    const next = profile.role === 'customer'
      ? '/'
      : mode === 'verify' || destination === '/' ? '/operations' : destination;
    navigate(next, { replace: true });
  }
  if (mode === 'google' || mode === 'error')
    return (
      <div className="surface auth-form">
        {mode === 'error' || error ? (
          <>
            <h1>تعذّر تسجيل الدخول</h1>
            {error ? <ErrorBox error={error} /> : null}
            <Link to="/login">العودة لتسجيل الدخول</Link>
          </>
        ) : (
          <p role="status">جارٍ تسجيل الدخول…</p>
        )}
      </div>
    );
  return (
    <div className="auth-layout">
      <aside className="auth-art">
        <ShoppingBag size={48} />
        <h2>
          من متجرك المفضّل،
          <br /> إلى بابك.
        </h2>
        <p>تسوّق محليًا وتابع طلبك خطوة بخطوة.</p>
      </aside>
      <div className="surface auth-form">
        <ShieldCheck size={32} />
        <h1>
          {mode === 'register'
            ? 'إنشاء حساب'
            : mode === 'verify'
              ? 'تحقّق من رقم الهاتف'
              : 'مرحبًا بعودتك'}
        </h1>
        <p>
          {mode === 'verify'
            ? 'أدخل رمز التحقق المرسل إلى رقم هاتفك.'
            : 'أدخل بيانات حسابك للمتابعة.'}
        </p>
        <ActionForm
          key={mode}
          submit={submit}
          label={
            mode === 'register'
              ? 'إنشاء الحساب'
              : mode === 'verify'
                ? 'تحقّق من الرقم'
                : 'تسجيل الدخول'
          }
        >
          {mode === 'verify' && (
            <Field
              name="full_name"
              label="الاسم الكامل"
              autoComplete="name"
              maxLength={100}
            />
          )}
          {mode === 'verify' && <label>
            نوع الحساب
            <select name="role" defaultValue="customer">
              <option value="customer">عميل</option>
              <option value="store_owner">صاحب متجر</option>
              <option value="driver">سائق توصيل</option>
            </select>
            <small>السائقون والمتاجر يحتاجون إلى اعتماد الإدارة قبل بدء العمل.</small>
          </label>}
          <Field
            name="phone"
            label="رقم الهاتف"
            type="tel"
            pattern="0(59|56)[0-9]{7}"
            maxLength={10}
            defaultValue={knownPhone}
            autoComplete="tel-national"
          />
          {mode === 'verify' && (
            <Field
              name="code"
              label="رمز التحقق"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
            />
          )}
          {mode !== 'register' && (
            <Field
              name="password"
              label="كلمة المرور"
              type="password"
              autoComplete={
                mode === 'verify' ? 'new-password' : 'current-password'
              }
            />
          )}
        </ActionForm>
        {mode === 'verify' ? (
          <ActionForm
            label="إعادة إرسال الرمز"
            submit={async data => {
              await api(
                '/auth/resend-otp',
                json('POST', { phone: data.get('phone') }),
                false,
              );
              setNotice('طُلب إرسال رمز جديد.');
            }}
          >
            <Field
              name="phone"
              label="رقم إعادة الإرسال"
              type="tel"
              defaultValue={knownPhone}
            />
            {notice && <p role="status">{notice}</p>}
          </ActionForm>
        ) : (
          <Link
            className="text-link"
            to={mode === 'login' ? '/register' : '/login'}
            state={{ from: destination }}
          >
            {mode === 'login' ? 'إنشاء حساب جديد' : 'لدي حساب'}
          </Link>
        )}
        {mode === 'login' && (
          <>
            <Link to="/verify" state={{ from: destination }}>
              تحقق من رقم هاتفك
            </Link>
            {import.meta.env.VITE_GOOGLE_ENABLED === 'true' && (
              <a href="/api/v1/auth/google">تسجيل الدخول عبر Google</a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
