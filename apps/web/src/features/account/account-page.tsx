import { Link, useNavigate } from 'react-router-dom';
import { useIdentity } from '../../shared/auth/identity';
import { Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';

export default function Account() {
  const { profile, logout } = useIdentity();
  const navigate = useNavigate();
  return (
    <>
      <Title label="حسابي" />
      <div className="surface padded narrow">
        <h2>{profile?.full_name}</h2>
        <p dir="ltr">{profile?.phone}</p>
        <div className="stack">
          <Link className="button secondary" to="/orders">
            عرض الطلبات
          </Link>
          {profile?.role === 'customer' ? (
            <Link className="button secondary" to="/addresses">
              إدارة العناوين
            </Link>
          ) : (
            <Link className="button secondary" to="/operations">
              لوحة العمل
            </Link>
          )}
          <ActionForm
            label="تسجيل الخروج"
            submit={async () => {
              try {
                await logout();
              } finally {
                navigate('/', { replace: true });
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
