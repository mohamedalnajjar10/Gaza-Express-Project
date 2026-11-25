import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, ShoppingBag } from 'lucide-react';
import { ApiError, api, json } from '../../shared/api/client';
import { internalDestination, saveGoogleDestination, takeGoogleDestination } from '../../shared/auth/destination';
import { type Session } from '../../shared/auth/types';
import { useIdentity } from '../../shared/auth/identity';
import { normalizeDigits } from '../../shared/lib/numbers';
import { ActionForm, Field } from '../../shared/ui/form';
import { ErrorBox } from '../../shared/ui/feedback';

type Mode = 'login' | 'register' | 'verify' | 'google' | 'error';
const registrationEnabled = import.meta.env.VITE_SMS_PROVIDER !== 'disabled';
const registrationRoles = {
  customer: 'عميل',
  store_owner: 'صاحب متجر',
  driver: 'سائق',
} as const;

const STAFF_DESTINATIONS = ['/operations', '/orders', '/orders/:id', '/account', '/notifications'];

function isRegistrationRole(value: unknown): value is keyof typeof registrationRoles {
  return typeof value === 'string' && Object.hasOwn(registrationRoles, value);
}

function isStaffDestination(pathname: string): boolean {
  return STAFF_DESTINATIONS.some(path => Boolean(matchPath(path, pathname)));
}

function normalizeDigitInput(event: FormEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  const normalized = normalizeDigits(input.value);
  if (input.value !== normalized) input.value = normalized;
}

export default function Auth({ mode }: { mode: Mode }) {
  const { establish } = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const destination = internalDestination(location.state?.from);
  const knownPhone =
    typeof location.state?.phone === 'string' ? normalizeDigits(location.state.phone) : '';
  const requestedRole: unknown = location.state?.role;
  const knownRole = isRegistrationRole(requestedRole) ? requestedRole : undefined;
  const queryError = mode === 'error' ? new URLSearchParams(location.search).get('message') : null;
  const errorMessage = queryError === 'Authentication_failed'
    ? 'تعذّر إكمال تسجيل الدخول عبر Google. حاول مرة أخرى.'
    : queryError;

  const exchangeStarted = useRef(false);
  useEffect(() => {
    if (mode !== 'google') exchangeStarted.current = false;
    if (mode === 'error') takeGoogleDestination();
    if (mode === 'google' && !exchangeStarted.current) {
      exchangeStarted.current = true;
      const requestedPage = takeGoogleDestination();
      const pathname = requestedPage.split(/[?#]/, 1)[0];
      const staffPage = isStaffDestination(pathname) ? requestedPage : '/operations';
      void api<{ tokens: Session }>(
        '/auth/google/exchange',
        { method: 'POST' },
        false,
      )
        .then(({ tokens }) => establish(tokens))
        .then(profile => navigate(profile.role === 'customer' ? requestedPage : staffPage, { replace: true }), setError);
    }
  }, [mode, establish, navigate]);

  async function submit(form: FormData) {
    const phone = normalizeDigits(String(form.get('phone') ?? '')).trim();
    if (mode === 'register') {
      const role = form.get('role');
      if (!isRegistrationRole(role)) throw new ApiError(400, 'اختر نوع الحساب.');
      await api(
        '/auth/register',
        json('POST', { phone, role }),
        false,
      );
      navigate('/verify', { state: { phone, role, from: destination } });
      return;
    }
    const { tokens } = await api<{ tokens: Session }>(
      mode === 'verify' ? '/auth/verify-otp' : '/auth/login',
      json(
        'POST',
        mode === 'verify'
          ? {
              phone,
              code: normalizeDigits(String(form.get('code') ?? '')).trim(),
              full_name: String(form.get('full_name') ?? '').trim(),
              password: form.get('password'),
              ...(knownRole && { role: knownRole }),
            }
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
    const pathname = destination.split(/[?#]/, 1)[0];
    const next = profile.role === 'customer'
      ? destination
      : mode === 'login' && isStaffDestination(pathname) ? destination : '/operations';
    navigate(next, { replace: true });
  }

  if (!registrationEnabled && (mode === 'register' || mode === 'verify')) {
    return <div className="surface padded"><h1>التسجيل بالهاتف غير متاح حاليًا</h1><Link to="/login">تسجيل الدخول</Link></div>;
  }

  if (mode === 'google' || mode === 'error')
    return (
      <div className="surface auth-form">
        {mode === 'error' || error ? (
          <>
            <h1>تعذّر تسجيل الدخول</h1>
            {error ? <ErrorBox error={error} /> : errorMessage ? <p className="error" role="alert">{errorMessage}</p> : null}
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
        <ShoppingBag size={48} aria-hidden="true" />
        <h2>
          من متجرك المفضّل،
          <br /> إلى بابك.
        </h2>
        <p>تسوّق محليًا وتابع طلبك خطوة بخطوة.</p>
      </aside>
      <div className="surface auth-form">
        <ShieldCheck size={32} aria-hidden="true" />
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
          {mode === 'register' && (
            <fieldset className="auth-role-field">
              <legend>نوع الحساب</legend>
              <div className="auth-role-options">
                {Object.entries(registrationRoles).map(([role, label]) => (
                  <label key={role} className="check">
                    <input type="radio" name="role" value={role} required defaultChecked={role === (knownRole ?? 'customer')} />
                    {label}
                  </label>
                ))}
              </div>
              <small>يتطلب تشغيل المتجر أو بدء التوصيل اعتماد الإدارة.</small>
            </fieldset>
          )}
          {mode === 'verify' && knownRole && <p>نوع الحساب <strong>{registrationRoles[knownRole]}</strong></p>}
          {mode === 'verify' && (
            <Field
              name="full_name"
              label="الاسم الكامل"
              autoComplete="name"
              minLength={3}
              maxLength={100}
            />
          )}
          <Field
            name="phone"
            label="رقم الهاتف"
            type="tel"
            pattern="0(59|56)[0-9]{7}"
            maxLength={10}
            defaultValue={knownPhone}
            readOnly={mode === 'verify' && Boolean(knownPhone)}
            autoComplete="tel-national"
            onInput={normalizeDigitInput}
          />
          {mode === 'verify' && (
            <Field
              name="code"
              label="رمز التحقق"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              onInput={normalizeDigitInput}
            />
          )}
          {mode !== 'register' && (
            <>
              <Field
                name="password"
                label="كلمة المرور"
                type="password"
                minLength={mode === 'verify' ? 8 : undefined}
                autoComplete={
                  mode === 'verify' ? 'new-password' : 'current-password'
                }
              />
              {mode === 'verify' && (
                <small>كلمة المرور: 8 أحرف على الأقل وتشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا خاصًا (@$!%*?&amp;).</small>
              )}
            </>
          )}
        </ActionForm>
        {mode === 'verify' ? (
          <ActionForm
            label="إعادة إرسال الرمز"
            submit={async data => {
              const resendPhone = normalizeDigits(String(data.get('phone') ?? '')).trim();
              await api(
                '/auth/resend-otp',
                json('POST', { phone: resendPhone }),
                false,
              );
              setNotice('طُلب إرسال رمز جديد.');
            }}
          >
            <Field
              name="phone"
              label="رقم إعادة الإرسال"
              type="tel"
              pattern="0(59|56)[0-9]{7}"
              maxLength={10}
              defaultValue={knownPhone}
              readOnly={Boolean(knownPhone)}
              autoComplete="tel-national"
              onInput={normalizeDigitInput}
            />
            {notice && <p role="status">{notice}</p>}
          </ActionForm>
        ) : (mode !== 'login' || registrationEnabled) && (
          <Link
            className="text-link"
            to={mode === 'login' ? '/register' : '/login'}
            state={{ from: destination }}
          >
            {mode === 'login' ? 'إنشاء حساب جديد' : 'لدي حساب'}
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
        )}
        {mode === 'verify' && (
          <Link to="/register" state={{ phone: knownPhone, role: knownRole, from: destination }}>
            العودة إلى إنشاء الحساب
          </Link>
        )}
        {mode === 'login' && (
          <>
            {registrationEnabled && <Link className="text-link" to="/verify" state={{ from: destination }}>
              تحقق من رقم هاتفك
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>}
            {import.meta.env.VITE_GOOGLE_ENABLED === 'true' && (
              <a href="/api/v1/auth/google" onClick={() => saveGoogleDestination(destination)}>تسجيل الدخول عبر Google</a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
