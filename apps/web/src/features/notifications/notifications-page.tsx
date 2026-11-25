import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

const notificationLabels: Record<string, string> = {
  'payment.fraud_report': 'بلاغ اشتباه بإيصال الطلب',
  'payment.receipt_suspicious': 'تنبيه اشتباه احتيال على إيصال الطلب',
  'payment.receipt': 'إيصال جديد للطلب',
  'payment.fraud_suspended': 'تم تأكيد الاحتيال وتعطيل حساب عميل الطلب',
  'payment.fraud_dismissed': 'تمت مراجعة بلاغ الإيصال وحفظه للطلب',
  'payment.paid': 'تم تأكيد الدفع للطلب',
  'payment.refund_required': 'مطلوب رد مبلغ الطلب',
  'payment.refunded': 'تم رد مبلغ الطلب',
  'order.checkout': 'طلب جديد وارد',
  'order.accept': 'تم قبول الطلب وجارٍ التحضير',
  'order.quote': 'عرض سعر جديد للطلب',
  'order.approve_quote': 'تمت الموافقة على عرض السعر للطلب',
  'order.reject': 'تم رفض الطلب',
  'order.cancel': 'تم إلغاء الطلب',
  'order.ready': 'الطلب جاهز للاستلام',
  'order.assign': 'عرض توصيل جديد على الطلب',
  'order.accept_assignment': 'وافق السائق على توصيل الطلب',
  'order.decline_assignment': 'اعتذر السائق عن توصيل الطلب',
  'order.claim_delivery': 'تم استلام مهمة توصيل الطلب',
  'order.company_assign': 'تم إسناد الطلب لسائق شركة التوصيل',
  'order.reroute_delivery': 'تم تحويل الطلب إلى التوصيل المستقل',
  'order.pick_up': 'استلم السائق الطلب وهو في الطريق',
  'order.deliver': 'تم تسليم الطلب',
  'order.report_delivery_issue': 'بلاغ عن مشكلة في توصيل الطلب',
  'order.reset_delivery_code': 'تم إصدار رمز تسليم جديد للطلب',
  'order.confirm_return': 'تم تأكيد إرجاع الطلب إلى المتجر',
};

export default function Notifications() {
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const state = useResource(
    signal =>
      api<{
        notifications: {
          id: number;
          kind: string;
          orderId: number;
          readAt: string | null;
          createdAt: string;
        }[];
        nextBefore: number | null;
      }>(`/notifications${before ? `?before=${before}` : ''}`, { signal }),
    `notifications:${before}`,
  );
  return (
    <>
      <Title label="الإشعارات" />
      {cursors.length > 0 && (
        <button type="button" className="secondary" onClick={() => setCursors(previous => previous.slice(0, -1))}>
          عرض الأحدث
        </button>
      )}
      <Result state={state}>
        {value =>
          value.notifications.length ? (
            <div className="stack">
              {value.notifications.map(n => (
                <div className="surface padded" key={n.id}>
                  <Link to={`/orders/${n.orderId}`}>
                    {notificationLabels[n.kind] ?? 'تحديث على طلب'} #{n.orderId}
                  </Link>
                  <p>{new Date(n.createdAt).toLocaleString('ar-PS')}</p>
                  {!n.readAt && (
                    <ActionForm
                      label="تمت القراءة"
                      submit={async () => {
                        await api(`/notifications/${n.id}/read`, {
                          method: 'PATCH',
                        });
                        state.reload();
                      }}
                    />
                  )}
                </div>
              ))}
              {value.nextBefore && (
                <button
                  className="secondary"
                  onClick={() => {
                    const cursor = value.nextBefore;
                    if (cursor !== null) setCursors(previous => [...previous, cursor]);
                  }}
                >
                  عرض الأقدم
                </button>
              )}
            </div>
          ) : (
            <Empty title="لا توجد إشعارات" />
          )
        }
      </Result>
    </>
  );
}
