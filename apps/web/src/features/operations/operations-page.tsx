import { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Store, Truck } from 'lucide-react';
import { useIdentity } from '../../shared/auth/identity';
import { Busy } from '../../shared/ui/feedback';

const OwnerStores = lazy(() => import('./owner-stores'));
const Availability = lazy(() => import('../driver/driver-availability'));
const Admin = lazy(() => import('./admin-panel'));
const DeliveryCompanyAdmin = lazy(() =>
  import('./delivery-partners').then(module => ({ default: module.DeliveryCompanyAdmin })),
);
const DeliveryCompanyQueue = lazy(() =>
  import('./delivery-partners').then(module => ({ default: module.DeliveryCompanyQueue })),
);
const panels = {
  store_owner: { title: 'لوحة المتجر', detail: 'أدر متاجرك وأقسامك ومنتجاتك من مكان واحد.', icon: Store, page: OwnerStores, action: 'متابعة الطلبات' },
  driver: { title: 'لوحة السائق', detail: 'حدّث توفرك وتابع عروض التوصيل والطلبات المسندة إليك.', icon: Truck, page: Availability, action: 'عرض مهام التوصيل' },
  admin: { title: 'لوحة الإدارة', detail: 'راجع المتاجر وتابع الطلبات والسائقين وعمليات الدفع.', icon: ShieldCheck, page: Admin, action: 'الطلبات والمدفوعات' },
};

export default function Operations() {
  const { profile } = useIdentity();
  const [params] = useSearchParams();
  if (!profile || profile.role === 'customer') return null;
  const { title, detail, icon: Icon, page: Panel, action } = panels[profile.role];
  const tab = params.get('tab');
  const showCompanyAdmin = profile.role === 'admin' && (!tab || tab === 'business');
  return (
    <>
      <section className="workspace-heading">
        <div>
          <Icon size={32} aria-hidden="true" />
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
        <Link className="button" to="/orders">{action}<ArrowLeft size={17} aria-hidden="true" /></Link>
      </section>
      <Suspense fallback={<Busy />}>
        {showCompanyAdmin && <DeliveryCompanyAdmin />}
        {profile.role === 'store_owner' && <DeliveryCompanyQueue />}
        <Panel />
      </Suspense>
    </>
  );
}
