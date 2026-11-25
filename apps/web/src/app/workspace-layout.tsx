import { Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpLeft, ShoppingBag } from 'lucide-react';
import type { Role } from '../shared/auth/types';
import { AccountAvatar } from '../shared/ui/account-avatar';
import { Busy } from '../shared/ui/feedback';
import { workspaceAccountLinks, workspaces } from './workspace-navigation';
import '../styles/workspaces.css';

type StaffRole = Exclude<Role, 'customer'>;

export function WorkspaceLayout({
  role,
  name,
  photo,
}: {
  role: StaffRole;
  name?: string;
  photo?: string | null;
}) {
  const { pathname, search } = useLocation();
  const workspace = workspaces[role];
  const displayName = name?.trim() || workspace.title;

  useEffect(() => {
    if (role === 'store_owner' || role === 'admin') {
      void import('../styles/owner-workspace.css');
    }
  }, [role]);

  return (
    <div className={`workspace workspace--${role}`}>
      <a className="skip" href="#content">
        انتقل للمحتوى
      </a>
      <aside className="workspace-sidebar">
        <Link to="/operations" className="workspace-brand">
          <span className="workspace-mark">
            <ShoppingBag size={21} aria-hidden="true" />
          </span>
          <span>
            غزة إكسبرس<small>{workspace.title}</small>
          </span>
        </Link>
        {role === 'store_owner' && (
          <p className="owner-nav-label">إدارة أعمالك</p>
        )}
        <nav aria-label={`تنقل ${workspace.title}`}>
          {[...workspace.links, ...workspaceAccountLinks].map(
            ({ label, to, icon: Icon }) => {
              const active =
                to === '/orders'
                  ? pathname === to || pathname.startsWith('/orders/')
                  : to === pathname + search;
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </Link>
              );
            },
          )}
        </nav>
        {role === 'store_owner' && (
          <div className="owner-sidebar-tip">
            <ShoppingBag size={24} aria-hidden="true" />
            <strong>جاهز ليوم جديد؟</strong>
            <p>
              حدّث توفر منتجاتك وراجع طلباتك باستمرار لتقديم تجربة أفضل لعملائك.
            </p>
            <Link to="/orders">انتقل إلى الطلبات ←</Link>
          </div>
        )}
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <span className="workspace-user">
            <AccountAvatar compact name={displayName} src={photo} />
            <span>
              {displayName}
              {role === 'store_owner' && <small>حساب صاحب المتجر</small>}
            </span>
          </span>
          <Link to="/">
            عرض واجهة العملاء <ArrowUpLeft size={16} aria-hidden="true" />
          </Link>
        </header>
        <main id="content" className="workspace-content">
          <Suspense fallback={<Busy />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
