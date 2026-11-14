import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

export default function Notifications() {
  const [before, setBefore] = useState<number | null>(null);
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
      <Result state={state}>
        {value =>
          value.notifications.length ? (
            <div className="stack">
              {value.notifications.map(n => (
                <div className="surface padded" key={n.id}>
                  <Link to={`/orders/${n.orderId}`}>
                    تحديث على طلب #{n.orderId}
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
                  onClick={() => setBefore(value.nextBefore)}
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
