import { type ReactNode } from 'react';
import { AlertCircle, LoaderCircle, PackageOpen } from 'lucide-react';
import { ApiError } from '../api/client';

export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const status = error instanceof ApiError ? error.status : 0;
  const wait = error instanceof ApiError ? error.retryAfterSeconds : undefined;
  const message =
    status === 401
      ? 'انتهت الجلسة. سجّل الدخول مرة أخرى.'
      : status === 403
        ? 'لا تملك صلاحية تنفيذ هذا الإجراء.'
        : status === 404
          ? 'العنصر المطلوب غير متاح.'
          : status === 409
            ? 'تغيّرت البيانات. حدّث الصفحة وحاول مرة أخرى.'
            : status === 413
              ? 'حجم الملف يتجاوز الحد المسموح. اختر ملفًا أصغر.'
            : status === 502 || status === 503 || status === 504
              ? 'الخدمة غير متاحة مؤقتًا. حاول مجددًا بعد قليل.'
            : status === 429
              ? wait
                ? `محاولات كثيرة. حاول مجددًا بعد ${wait} ثانية.`
                : 'محاولات كثيرة. حاول بعد قليل.'
              : status === 400 && error instanceof Error
                ? error.message
                : 'تعذّر إتمام العملية. تحقق من الاتصال وحاول مجددًا.';
  return (
    <div className="error" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      {retry && (
        <button className="secondary" onClick={retry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
export function Busy() {
  return (
    <div className="busy" role="status">
      <LoaderCircle size={20} /> جارٍ التحميل…
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <PackageOpen size={36} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function Result<T>({
  state,
  children,
}: {
  state: { data?: T; error?: unknown; reload: () => void };
  children: (data: T) => ReactNode;
}) {
  return state.error ? (
    <ErrorBox error={state.error} retry={state.reload} />
  ) : state.data === undefined ? (
    <Busy />
  ) : (
    <>{children(state.data)}</>
  );
}
export function Title({ label, detail }: { label: string; detail?: string }) {
  return (
    <header className="section-title">
      <h1>{label}</h1>
      {detail && <p>{detail}</p>}
    </header>
  );
}
