import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpLeft, ShoppingBag } from 'lucide-react';
import type { Role } from '../shared/auth/types';
import { Busy } from '../shared/ui/feedback';
import { workspaceAccountLinks, workspaces } from './workspace-navigation';
import '../styles/workspaces.css';

type StaffRole = Exclude<Role, 'customer'>;

export function WorkspaceLayout({ role, name }: { role: StaffRole; name?: string }) {
  const { pathname, search } = useLocation();
  const workspace = workspaces[role];

  return (
    <div className={`workspace workspace--${role}`}>
      <a className="skip" href="#content">انتقل للمحتوى</a>
      <aside className="workspace-sidebar">
        <Link to="/operations" className="workspace-brand">
          <span className="workspace-mark"><ShoppingBag size={21} /></span>
          <span>غزة إكسبرس<small>{workspace.title}</small></span>
        </Link>
        <nav aria-label={`تنقل ${workspace.title}`}>
          {[...workspace.links, ...workspaceAccountLinks].map(({ label, to, icon: Icon }) => {
            const active = to === '/orders'
              ? pathname === to || pathname.startsWith('/orders/')
              : to === pathname + search;
            return (
              <Link key={to} to={to} aria-current={active ? 'page' : undefined}>
                <Icon size={19} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <span>{name?.trim() || workspace.title}</span>
          <Link to="/">عرض واجهة العملاء <ArrowUpLeft size={16} aria-hidden="true" /></Link>
        </header>
        <main id="content" className="workspace-content">
          <Suspense fallback={<Busy />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
