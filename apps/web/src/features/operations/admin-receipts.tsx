import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, json } from '../../shared/api/client';
import { Empty, Result } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';
import { Pager } from '../../shared/ui/pager';
import { money } from '../../shared/lib/money';
import { normalizeDigits, PLATFORM_BANK_PHONE } from '../../shared/lib/numbers';
import { ForensicReportCard, ReceiptImage, type ForensicReport } from '../orders/bank-payment';

type FraudQueueRow = {
  orderId: number;
  submittedAt: string;
  verificationStatus: string;
  riskLevel: string;
  riskScore: number;
  forensicReport?: ForensicReport | null;
  transferReference?: string | null;
  senderPhone?: string | null;
  reportReason?: string | null;
  reportedAt?: string | null;
  decision?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  payment: {
    amount: string;
    currency: string;
    status: string;
    recipientPhone?: string | null;
    storeCollected: boolean;
    order: {
      status: string;
      storeId: number;
      storeName: string;
      store: { storeNameAr?: string | null };
      customer: { user_id: number; full_name: string; full_name_ar?: string | null; phone: string; is_active: boolean };
    };
  };
};

export function FraudReports() {
  const [status, setStatus] = useState<'reported' | 'suspicious' | 'pending' | 'all'>('reported');
  const [page, setPage] = useState(1);
  const state = useResource(
    signal => api<{ items: FraudQueueRow[]; meta: { total: number; page: number; totalPages: number } }>(
      `/finance/receipt-reports?status=${status}&page=${page}&limit=20`,
      { signal },
    ),
    `fraud-reports:${status}:${page}`,
  );
  const filters: Array<{ id: 'reported' | 'suspicious' | 'pending' | 'all'; label: string }> = [
    { id: 'reported', label: 'بلاغات مفتوحة' },
    { id: 'suspicious', label: 'اشتباه تلقائي مرتفع' },
    { id: 'pending', label: 'بانتظار المطابقة' },
    { id: 'all', label: 'كل الإيصالات' },
  ];
  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="تصفية الإيصالات والبلاغات">
        {filters.map(item => (
          <button
            key={item.id}
            type="button"
            className={`chip${status === item.id ? ' selected' : ''}`}
            aria-pressed={status === item.id}
            onClick={() => { setStatus(item.id); setPage(1); }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Result state={state}>
        {res => (
          <>
            {res.items.length ? (
              <div className="stack">
                {res.items.map(row => {
                  const customer = row.payment.order.customer;
                  const storeTitle = row.payment.order.store.storeNameAr || row.payment.order.storeName;
                  return (
                    <article className="surface padded admin-fraud-card" key={row.orderId}>
                      <div className="admin-user-head">
                        <div>
                          <h3>
                            <Link to={`/orders/${row.orderId}`}>طلب #{row.orderId}</Link> · {storeTitle}
                          </h3>
                          <div className="admin-fraud-meta">
                            <span>العميل: {customer.full_name_ar || customer.full_name} (<bdi dir="ltr">{customer.phone}</bdi>)</span>
                            <span>المبلغ: <strong>{money(row.payment.amount, row.payment.currency)}</strong></span>
                            <span>رقم التحويل: <bdi dir="ltr">{row.payment.recipientPhone || PLATFORM_BANK_PHONE}</bdi></span>
                          </div>
                        </div>
                        <span className={`payment-badge ${customer.is_active ? 'is-due' : 'is-fraud'}`}>
                          {customer.is_active ? 'حساب العميل نشط' : 'حساب العميل معطّل'}
                        </span>
                      </div>

                      {row.forensicReport && <ForensicReportCard report={row.forensicReport} />}

                      {row.reportReason && (
                        <div className="fraud-alert-banner" role="alert">
                          <div>
                            <strong>بلاغ المتجر:</strong> {row.reportReason}
                            {row.decision && (
                              <p>القرار: {row.decision === 'suspend' ? 'تأكيد الاحتيال وتعطيل الحساب' : 'حفظ البلاغ'} {row.reviewNote ? `(${row.reviewNote})` : ''}</p>
                            )}
                          </div>
                        </div>
                      )}

                      <ReceiptImage path={`/orders/${row.orderId}/payment/receipt`} />

                      {(row.reportReason || row.verificationStatus === 'FLAGGED_SUSPICIOUS') && !row.decision && (
                        <ActionForm
                          label="اعتماد قرار المراجعة"
                          submit={async fields => {
                            const note = String(fields.get('note') ?? '').trim();
                            await api(
                              `/orders/${row.orderId}/payment/receipt/review`,
                              json('POST', { decision: fields.get('decision'), ...(note && { note }) }),
                            );
                            state.reload();
                          }}
                        >
                          <label>
                            القرار النهائي
                            <select name="decision" required defaultValue="">
                              <option value="" disabled>اختر القرار</option>
                              <option value="dismiss">حفظ البلاغ والسماح بالمطابقة</option>
                              <option value="suspend">تأكيد الاحتيال وتعطيل حساب العميل</option>
                            </select>
                          </label>
                          <Field name="note" label="ملاحظة المراجعة (اختياري)" required={false} maxLength={500} />
                        </ActionForm>
                      )}
                      {!row.reportReason && ['DUE', 'VOID'].includes(row.payment.status) && (
                        <details className="surface padded">
                          <summary>إجراءات الإدارة السريعة (بلاغ احتيال / مطابقة بنكية)</summary>
                          <div className="stack">
                            <ActionForm
                              label="إرسال بلاغ احتيال للمراجعة"
                              submit={async fields => {
                                await api(
                                  `/orders/${row.orderId}/payment/receipt/report`,
                                  json('POST', { reason: String(fields.get('reason') ?? '').trim() }),
                                );
                                state.reload();
                              }}
                            >
                              <Field label="سبب الاشتباه" name="reason" maxLength={500} />
                            </ActionForm>
                            {row.verificationStatus !== 'FLAGGED_SUSPICIOUS' && (
                              <ActionForm
                                label="تأكيد المطابقة مع كشف البنك"
                                submit={async fields => {
                                  await api(
                                    `/orders/${row.orderId}/payment/bank-reconciliation`,
                                    json('POST', {
                                      amount: Number(normalizeDigits(String(fields.get('amount') ?? ''))),
                                      currency: row.payment.currency,
                                      reference: String(fields.get('reference') ?? '').trim(),
                                    }),
                                  );
                                  state.reload();
                                }}
                              >
                                <Field
                                  name="amount"
                                  label="المبلغ في كشف البنك"
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  defaultValue={row.payment.amount}
                                />
                                <Field
                                  name="reference"
                                  label="مرجع البنك"
                                  pattern="[A-Za-z0-9_.:-]{3,70}"
                                  maxLength={70}
                                />
                              </ActionForm>
                            )}
                          </div>
                        </details>
                      )}
                      <Link className="text-link" to={`/orders/${row.orderId}`}>فتح صفحة الطلب الكاملة</Link>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty title="لا توجد بلاغات أو إيصالات ضمن هذا التصنيف" />
            )}
            <Pager page={page} more={page < res.meta.totalPages} setPage={setPage} />
          </>
        )}
      </Result>
    </div>
  );
}
