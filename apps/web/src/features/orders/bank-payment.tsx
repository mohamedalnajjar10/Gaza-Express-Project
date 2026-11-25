import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, Copy, Landmark, ShieldAlert, ShieldCheck, Upload, XCircle,
} from 'lucide-react';
import { api, ApiError, json } from '../../shared/api/client';
import { useResource } from '../../shared/hooks/use-resource';
import { ErrorBox, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { money } from '../../shared/lib/money';
import { normalizeDigits, PLATFORM_BANK_PHONE } from '../../shared/lib/numbers';
import type { Order } from './types';
import './payment.css';

export type ForensicCheck = {
  code: string;
  labelAr: string;
  status: 'pass' | 'warn' | 'fail';
  detailAr: string;
};

export type ForensicReport = {
  checkedAt?: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  verdict: 'LIKELY_AUTHENTIC' | 'NEEDS_ATTENTION' | 'SUSPICIOUS';
  summaryAr: string;
  duplicateOrderIds?: number[];
  matchesConfirmedFraud?: boolean;
  detectedSoftware?: string[];
  checks: ForensicCheck[];
};

export type PaymentReceipt = {
  submittedAt: string;
  transferReference?: string | null;
  senderPhone?: string | null;
  verificationStatus?: string;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  riskScore?: number;
  forensicReport?: ForensicReport | null;
  reportReason?: string | null;
  reportedAt?: string | null;
  decision?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};

type Payment = {
  amount?: string;
  currency?: string;
  status: string;
  recipientPhone?: string;
  bankInstructions?: string;
  whatsappText?: string;
  whatsappReceived?: boolean;
  storeCollected?: boolean;
  receipt?: PaymentReceipt | null;
};

const fraudPresets = [
  { label: 'صورة إيصال مزورة أو معدّلة', text: 'صورة الإيصال مزورة أو معدّلة ولم يصل المبلغ في كشف حساب بنك فلسطين.' },
  { label: 'صورة إيصال مكررة', text: 'صورة الإيصال مكررة ومستخدمة في تحويل سابق.' },
  { label: 'مبلغ أو مرجع غير مطابق', text: 'المبلغ المحوّل أو المرجع غير مطابق لقيمة الطلب المطلوبة.' },
];

function CopyButton({ value, label = 'نسخ' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="secondary copy-pill"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
      }}
    >
      {copied ? <><Check size={14} /> تم النسخ</> : <><Copy size={14} /> {label}</>}
    </button>
  );
}

export function ReceiptImage({ path }: { path: string }) {
  const [image, setImage] = useState('');
  useEffect(() => () => { if (image) URL.revokeObjectURL(image); }, [image]);
  return image ? (
    <div className="receipt-image-frame">
      <img src={image} alt="إيصال التحويل المرفق" />
    </div>
  ) : (
    <ActionForm
      label="عرض صورة الإيصال"
      submit={async () => {
        setImage(URL.createObjectURL(await api<Blob>(path, {}, true, 'blob')));
      }}
    />
  );
}

export function ForensicReportCard({ report }: { report: ForensicReport }) {
  const levelClass = report.riskLevel === 'HIGH' ? 'is-high' : report.riskLevel === 'MEDIUM' ? 'is-medium' : 'is-low';
  const badgeLabel =
    report.riskLevel === 'HIGH'
      ? `اشتباه تزوير / تكرار (${report.riskScore}/100)`
      : report.riskLevel === 'MEDIUM'
        ? `يحتاج تدقيقاً (${report.riskScore}/100)`
        : `فحص مبدئي سليم (${report.riskScore}/100)`;
  return (
    <div className={`forensic-card ${levelClass}`} aria-label="نتائج الفحص التلقائي للإيصال">
      <div className="forensic-head">
        <strong>
          {report.riskLevel === 'HIGH'
            ? <ShieldAlert size={18} aria-hidden="true" />
            : <ShieldCheck size={18} aria-hidden="true" />}{' '}
          نتائج التحقق التلقائي من أصالة الإيصال
        </strong>
        <span className={`payment-badge ${report.riskLevel === 'HIGH' ? 'is-fraud' : report.riskLevel === 'MEDIUM' ? 'is-due' : 'is-paid'}`}>
          {badgeLabel}
        </span>
      </div>
      <p>{report.summaryAr}</p>
      {!!report.checks?.length && (
        <ul className="forensic-checks">
          {report.checks.map(check => (
            <li key={check.code} className={`forensic-check-item is-${check.status}`}>
              {check.status === 'pass'
                ? <CheckCircle2 size={16} aria-hidden="true" />
                : check.status === 'warn'
                  ? <AlertTriangle size={16} aria-hidden="true" />
                  : <XCircle size={16} aria-hidden="true" />}
              <div>
                <strong>{check.labelAr}</strong>
                <div>{check.detailAr}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PaymentStepper({ orderStatus, payment }: { orderStatus?: string; payment: Payment | null }) {
  const hasOrderApproved = Boolean(payment) || (orderStatus && !['PENDING', 'QUOTED', 'REJECTED', 'CANCELLED'].includes(orderStatus));
  const hasReceipt = Boolean(payment?.receipt);
  const isFraudConfirmed = payment?.receipt?.decision === 'suspend';
  const isReported = Boolean(payment?.receipt?.reportReason && !payment?.receipt?.decision);
  const isPaid = payment?.status === 'PAID' || payment?.status === 'REFUNDED' || payment?.status === 'REFUND_REQUIRED';

  const steps = [
    { label: '1. اعتماد السعر', state: hasOrderApproved ? 'is-done' : 'is-current' },
    { label: '2. التحويل لبنك فلسطين', state: hasReceipt || isPaid ? 'is-done' : hasOrderApproved ? 'is-current' : '' },
    {
      label: '3. فحص الإيصال',
      state: isFraudConfirmed || isReported ? 'is-danger' : isPaid ? 'is-done' : hasReceipt ? 'is-current' : '',
    },
    { label: '4. تأكيد الدفع', state: isPaid ? 'is-done' : isFraudConfirmed ? 'is-danger' : '' },
  ];

  return (
    <ol className="payment-stepper" aria-label="مراحل الدفع عبر بنك فلسطين">
      {steps.map(step => (
        <li key={step.label} className={step.state}>{step.label}</li>
      ))}
    </ol>
  );
}

function ReceiptUploadForm({
  path,
  amount,
  currency,
  label,
  fieldLabel,
  onUploaded,
}: {
  path: string;
  amount?: string;
  currency?: string;
  label: string;
  fieldLabel: string;
  onUploaded: () => void;
}) {
  const [preview, setPreview] = useState('');
  const [fileError, setFileError] = useState('');
  const [fileInfo, setFileInfo] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <ActionForm
      label={label}
      submit={async data => {
        if (fileError) throw new ApiError(400, fileError);
        const body = new FormData();
        const image = data.get('image');
        if (image) body.append('image', image);
        for (const key of ['transferReference', 'senderPhone', 'claimedAmount']) {
          const val = normalizeDigits(String(data.get(key) ?? '')).trim();
          if (val) body.append(key, val);
        }
        await api(path + '/receipt', { method: 'POST', body });
        onUploaded();
      }}
    >
      <label>
        {fieldLabel}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={event => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            setFileError('');
            setFileInfo('');
            if (preview) URL.revokeObjectURL(preview);
            setPreview('');
            if (!file) return;
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
              input.value = '';
              setFileError('ارفع صورة إيصال صالحة بصيغة JPG أو PNG أو WebP.');
              return;
            }
            if (file.size > 5 * 1024 * 1024) {
              input.value = '';
              setFileError('حجم الصورة يتجاوز 5 ميغابايت.');
              return;
            }
            setFileInfo(`${file.name} · ${(file.size / 1024).toFixed(0)} كيلوبايت`);
            setPreview(URL.createObjectURL(file));
          }}
        />
      </label>
      {fileError && <p className="error" role="alert">{fileError}</p>}
      {preview && (
        <div className="receipt-preview-box">
          <small><Upload size={14} aria-hidden="true" /> معاينة الإيصال قبل الإرسال ({fileInfo})</small>
          <img src={preview} alt="معاينة صورة الإيصال" />
          <small>تأكد من وضوح رقم المرجع والمبلغ وتاريخ التحويل؛ لا يمكن تعديل الإيصال بعد إرساله.</small>
        </div>
      )}
      <Field
        name="transferReference"
        label="رقم مرجع التحويل (اختياري)"
        pattern="[A-Za-z0-9_.:-]{3,100}"
        required={false}
        maxLength={100}
      />
      <small>يُقبل 3–100 حرف إنجليزي أو رقم أو الرموز (._:-) كما تظهر في الإيصال.</small>
      <Field
        name="senderPhone"
        label="رقم الجوال المحوّل منه (اختياري)"
        type="tel"
        pattern="0(59|56)[0-9٠-٩۰-۹]{7}"
        required={false}
      />
      <Field
        name="claimedAmount"
        label={`المبلغ المحوّل${currency ? ` (${currency})` : ''} (اختياري)`}
        type="number"
        step="0.01"
        min={0.01}
        defaultValue={amount}
        required={false}
      />
    </ActionForm>
  );
}

function StoreReportForm({ path, onReported }: { path: string; onReported: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>();

  async function confirmReport() {
    if (submitting || !pendingReason) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await api(path + '/receipt/report', json('POST', { reason: pendingReason }));
      dialogRef.current?.close();
      setPendingReason('');
      onReported();
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        className="form"
        onSubmit={event => {
          event.preventDefault();
          if (!event.currentTarget.reportValidity()) return;
          const reason = String(textareaRef.current?.value ?? '').trim();
          if (reason.length < 5) return;
          setPendingReason(reason);
          setSubmitError(undefined);
          dialogRef.current?.showModal();
        }}
      >
        <div className="fraud-presets" role="group" aria-label="أسباب شائعة للبلاغ">
          {fraudPresets.map(preset => (
            <button
              key={preset.label}
              type="button"
              className="secondary"
              title={preset.text}
              onClick={() => {
                if (textareaRef.current) {
                  textareaRef.current.value = preset.text;
                  textareaRef.current.focus();
                }
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label>
          سبب الاشتباه
          <textarea
            ref={textareaRef}
            name="reason"
            required
            minLength={5}
            maxLength={500}
            placeholder="اذكر سبب الاشتباه بالتزوير أو عدم مطابقة كشف بنك فلسطين..."
          />
        </label>
        <button type="submit">إرسال بلاغ للأدمن</button>
      </form>
      <dialog ref={dialogRef} className="admin-dialog" aria-labelledby="fraud-confirm-title">
        <h3 id="fraud-confirm-title">تأكيد الإبلاغ عن اشتباه احتيال</h3>
        <p>هل أنت متأكد من إرسال البلاغ؟ سيُجمّد اعتماد هذا الإيصال وتتم مراجعته من الإدارة.</p>
        {pendingReason && <p><strong>سبب البلاغ:</strong> {pendingReason}</p>}
        {submitError ? <ErrorBox error={submitError} /> : null}
        <div className="admin-dialog-actions">
          <button type="button" disabled={submitting} onClick={() => void confirmReport()}>
            {submitting ? 'جارٍ الإرسال…' : 'تأكيد إرسال البلاغ'}
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
    </>
  );
}

export function BankPayment({
  id,
  role,
  order,
  onConfirmed,
}: {
  id: number;
  role: string;
  order?: Order;
  onConfirmed?: () => void;
}) {
  const path = `/orders/${id}/payment`;
  const state = useResource(
    signal =>
      api<Payment>(path, { signal }).catch(error => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }),
    path,
  );

  const statusLabels: Record<string, string> = {
    PAID: 'تم تأكيد وصول المبلغ والتحقق من التحويل',
    VOID: 'أُلغي الدفع لهذا الطلب',
    REFUNDED: 'تم تسجيل الاسترداد',
    REFUND_REQUIRED: 'المبلغ بانتظار الاسترداد',
  };

  return (
    <Result state={state}>
      {p => {
        if (!p) {
          if (order && ['PENDING', 'QUOTED'].includes(order.status)) {
            const expectedPhone = order.store?.bankTransferPhone || PLATFORM_BANK_PHONE;
            return (
              <section className="surface padded bop-card">
                <div className="bop-header">
                  <div className="bop-brand">
                    <span className="bop-brand-icon"><Landmark size={20} aria-hidden="true" /></span>
                    <div>
                      <h2>التحويل عبر بنك فلسطين</h2>
                      <small>بانتظار اعتماد السعر النهائي من المتجر</small>
                    </div>
                  </div>
                  <span className="payment-badge is-due">الخطوة 1 من 4</span>
                </div>
                <PaymentStepper orderStatus={order.status} payment={null} />
                <div className="bop-recipient-box">
                  <div className="bop-detail-row">
                    <div>
                      <span className="bop-detail-label">رقم التحويل المخصّص لهذا المتجر</span>
                      <strong className="bop-detail-value" dir="ltr">{expectedPhone}</strong>
                    </div>
                    <CopyButton value={expectedPhone} label="نسخ الرقم" />
                  </div>
                </div>
                <p>فور اعتماد المتجر للسعر النهائي سيظهر لك المبلغ الدقيق وخانة رفع صورة إيصال التحويل للتحقق منها.</p>
              </section>
            );
          }
          return null;
        }

        const recipient = p.recipientPhone;
        const canReconcile =
          ['DUE', 'VOID'].includes(p.status) &&
          (!p.receipt?.reportReason || p.receipt.decision === 'dismiss') &&
          (role === 'admin' || (role === 'store_owner' && p.storeCollected));

        return (
          <section className="surface padded bop-card">
            <div className="bop-header">
              <div className="bop-brand">
                <span className="bop-brand-icon"><Landmark size={20} aria-hidden="true" /></span>
                <div>
                  <h2>التحويل عبر بنك فلسطين</h2>
                  <small>
                    {p.storeCollected
                      ? 'تحويل مباشر لحساب المتجر عبر بنك فلسطين'
                      : 'تحويل عبر حساب منصة غزة إكسبرس المعتمد'}
                  </small>
                </div>
              </div>
              <span className={`payment-badge ${p.status === 'PAID' ? 'is-paid' : p.receipt?.reportReason ? 'is-fraud' : p.receipt ? 'is-review' : 'is-due'}`}>
                {p.status === 'PAID'
                  ? 'مدفوع ومؤكّد'
                  : p.receipt?.decision === 'suspend'
                    ? 'احتيال مؤكّد'
                    : p.receipt?.reportReason && !p.receipt.decision
                      ? 'بلاغ احتيال قيد المراجعة'
                      : p.receipt
                        ? 'بانتظار المطابقة البنكية'
                        : 'بانتظار رفع الإيصال'}
              </span>
            </div>

            <PaymentStepper orderStatus={order?.status} payment={p} />

            {p.amount != null && (
              <div className="bop-recipient-box">
                <div className="bop-detail-row">
                  <div>
                    <span className="bop-detail-label">المبلغ المعتمد للتحويل</span>
                    <strong className="bop-detail-value">{money(p.amount, p.currency)}</strong>
                    <small className="bop-detail-label">يُنسخ الرقم ({p.amount}) بدون رمز العملة للصقه في التطبيق البنكي.</small>
                  </div>
                  <CopyButton value={p.amount} label="نسخ قيمة المبلغ" />
                </div>
                {recipient && (
                  <div className="bop-detail-row">
                    <div>
                      <span className="bop-detail-label">رقم المستفيد (بنك فلسطين)</span>
                      <strong className="bop-detail-value" dir="ltr">{recipient}</strong>
                    </div>
                    <CopyButton value={recipient} label="نسخ الرقم" />
                  </div>
                )}
                {p.whatsappText && (
                  <div className="bop-detail-row">
                    <div>
                      <span className="bop-detail-label">مرجع الملاحظات عند التحويل</span>
                      <strong dir="ltr">{p.whatsappText}</strong>
                    </div>
                    <CopyButton value={p.whatsappText} label="نسخ المرجع" />
                  </div>
                )}
              </div>
            )}

            {p.status === 'VOID' && !p.receipt && role === 'customer' && (
              <ReceiptUploadForm
                path={path}
                amount={p.amount}
                currency={p.currency}
                label="إرفاق إيصال تحويل سابق للإلغاء"
                fieldLabel="إيصال التحويل السابق"
                onUploaded={state.reload}
              />
            )}

            {p.status === 'DUE' ? (
              <>
                {p.bankInstructions && <p>{p.bankInstructions}</p>}
                <p>
                  {p.receipt
                    ? p.receipt.decision === 'suspend'
                      ? 'تم رفض الإيصال وتأكيد محاولة الاحتيال وتعطيل الحساب.'
                      : p.receipt.reportReason && !p.receipt.decision
                        ? 'تم إرسال بلاغ اشتباه للأدمن وبانتظار مراجعته قبل أي إجراء.'
                        : 'وصل الإيصال وهو بانتظار التحقق ومطابقة كشف بنك فلسطين.'
                    : 'بعد تنفيذ التحويل عبر بنك فلسطين، أرفق صورة إيصال واضحة لإتمام التحقق من أصالتها.'}
                </p>
                {role === 'customer' && !p.receipt && (
                  <ReceiptUploadForm
                    path={path}
                    amount={p.amount}
                    currency={p.currency}
                    label="إرسال إيصال التحويل"
                    fieldLabel="صورة الإيصال (حتى 5 ميغابايت)"
                    onUploaded={state.reload}
                  />
                )}
              </>
            ) : (
              <p><strong>{statusLabels[p.status] ?? p.status}</strong></p>
            )}

            {p.receipt && (
              <div className="stack">
                <ReceiptImage path={path + '/receipt'} />

                {(p.receipt.transferReference || p.receipt.senderPhone) && (
                  <div className="bop-recipient-box">
                    {p.receipt.transferReference && (
                      <div><strong>مرجع التحويل المصرّح من العميل:</strong> <span dir="ltr">{p.receipt.transferReference}</span></div>
                    )}
                    {p.receipt.senderPhone && (
                      <div><strong>رقم المحوّل:</strong> <span dir="ltr">{p.receipt.senderPhone}</span></div>
                    )}
                  </div>
                )}

                {p.receipt.forensicReport && ['store_owner', 'admin'].includes(role) && (
                  <ForensicReportCard report={p.receipt.forensicReport} />
                )}

                {p.receipt.reportReason && (
                  <div className="fraud-alert-banner" role="alert">
                    <ShieldAlert size={20} aria-hidden="true" />
                    <div>
                      <strong>بلاغ اشتباه باحتيال من المتجر / الإدارة</strong>
                      <p>سبب البلاغ: {p.receipt.reportReason}</p>
                      {p.receipt.decision && (
                        <p>
                          {p.receipt.decision === 'suspend'
                            ? 'عطّل الأدمن الحساب بعد مراجعة البلاغ.'
                            : 'راجع الأدمن البلاغ وحفظه.'}
                          {p.receipt.reviewNote && ` — ملاحظة الأدمن: ${p.receipt.reviewNote}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {canReconcile && (
                  <ActionForm
                    label="تأكيد المطابقة مع كشف البنك"
                    submit={async data => {
                      await api(
                        path + '/bank-reconciliation',
                        json('POST', {
                          amount: Number(data.get('amount')),
                          currency: p.currency,
                          reference: data.get('reference'),
                        }),
                      );
                      state.reload();
                      onConfirmed?.();
                    }}
                  >
                    {p.receipt.riskLevel === 'HIGH' && (
                      <div className="fraud-alert-banner" role="alert">
                        <AlertTriangle size={18} aria-hidden="true" />
                        <div>
                          <strong>تحذير قبل المطابقة</strong>
                          <p>أظهر الفحص التلقائي مؤشرات اشتباه مرتفعة. تأكد من وجود الحركة فعلياً في كشف بنك فلسطين قبل الاعتماد.</p>
                        </div>
                      </div>
                    )}
                    <p>افتح كشف حساب المستفيد وطابق المبلغ والعملة والمرجع مع حركة واردة مكتملة.</p>
                    <Field name="amount" label="المبلغ في كشف البنك" type="number" step="0.01" min={0} defaultValue={p.amount} />
                    <Field name="reference" label="مرجع البنك" pattern="[A-Za-z0-9_.:-]{3,70}" maxLength={70} />
                    <small>استخدم 3–70 حرفًا إنجليزيًا أو رقمًا أو الرموز (._:-).</small>
                  </ActionForm>
                )}

                {['store_owner', 'admin'].includes(role) && ['DUE', 'VOID'].includes(p.status) && !p.receipt.reportReason && (
                  <StoreReportForm path={path} onReported={state.reload} />
                )}

                {role === 'admin' && p.receipt.reportReason && !p.receipt.decision && (
                  <ActionForm
                    label="اعتماد قرار المراجعة"
                    submit={async data => {
                      const note = String(data.get('note') ?? '').trim();
                      await api(
                        path + '/receipt/review',
                        json('POST', {
                          decision: data.get('decision'),
                          ...(note && { note }),
                        }),
                      );
                      state.reload();
                    }}
                  >
                    <label>
                      القرار بعد مراجعة الإيصال وكشف الحساب
                      <select name="decision" required defaultValue="">
                        <option value="" disabled>اختر القرار</option>
                        <option value="dismiss">حفظ البلاغ والسماح بالمطابقة</option>
                        <option value="suspend">تأكيد الاحتيال وتعطيل حساب العميل</option>
                      </select>
                    </label>
                    <Field name="note" label="ملاحظة القرار (اختياري)" required={false} maxLength={500} />
                  </ActionForm>
                )}
              </div>
            )}

            <button className="secondary" type="button" onClick={state.reload}>
              تحديث حالة الدفع
            </button>
          </section>
        );
      }}
    </Result>
  );
}
