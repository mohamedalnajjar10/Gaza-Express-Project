import { Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell,
  Heart,
  House,
  Package,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { useIdentity } from '../shared/auth/identity';
import { AccountAvatar } from '../shared/ui/account-avatar';
import { Busy } from '../shared/ui/feedback';
import { RewardsLink } from '../shared/ui/rewards';
import { WorkspaceLayout } from './workspace-layout';

function Header() {
  const { profile } = useIdentity();
  return (
    <header className="topbar">
      <div className="header-inner">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <ShoppingBag size={22} aria-hidden="true" />
          </span>
          <span>
            غزة إكسبرس<small>GAZA EXPRESS</small>
          </span>
        </Link>
        <nav aria-label="التنقل الرئيسي">
          {profile && <NavLink to="/" end>
            <House size={19} aria-hidden="true" /> المتاجر
          </NavLink>}
          {profile && profile.role !== 'customer' && (
            <NavLink to="/operations"><Package size={19} aria-hidden="true" /> لوحة العمل</NavLink>
          )}
          {profile?.role === 'customer' && (
            <NavLink to="/favorites">
              <Heart size={19} aria-hidden="true" /> المفضلة
            </NavLink>
          )}
          {profile?.role === 'customer' && (
            <NavLink to="/orders">
              <Package size={19} aria-hidden="true" /> الطلبات
            </NavLink>
          )}
          {profile?.role === 'customer' && <RewardsLink />}
        </nav>
        <div className="header-actions">
          {profile && (
            <Link
              className="icon-btn"
              aria-label="الإشعارات"
              to="/notifications"
            >
              <Bell size={21} aria-hidden="true" />
            </Link>
          )}
          {profile?.role === 'customer' && (
            <Link className="icon-btn" aria-label="السلة" to="/cart">
              <ShoppingBag size={21} aria-hidden="true" />
            </Link>
          )}
          <Link className="header-login" to={profile ? '/account' : '/login'}>
            {profile ? (
              <AccountAvatar compact src={profile.profile_photo_url} name={profile.full_name_ar?.trim() || profile.full_name?.trim() || 'حسابي'} />
            ) : <UserRound size={18} aria-hidden="true" />}
            <span>{profile ? 'حسابي' : 'تسجيل الدخول'}</span>
            {profile && <bdi className="header-profile-name">{profile.full_name_ar?.trim() || profile.full_name?.trim()}</bdi>}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const { profile } = useIdentity();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  if (profile && profile.role !== 'customer' && /^\/(operations|orders|account|notifications)(\/|$)/.test(pathname)) {
    return <WorkspaceLayout role={profile.role} name={profile.full_name_ar?.trim() || profile.full_name} photo={profile.profile_photo_url} />;
  }
  return (
    <>
      <a className="skip" href="#content">
        انتقل للمحتوى
      </a>
      <Header />
      <main id="content" className="container">
        <Suspense fallback={<Busy />}>
          <Outlet />
        </Suspense>
      </main>
      {profile?.role === 'customer' && <nav className="market-bottom-nav" aria-label="التنقل السريع">
        <NavLink aria-label="الرئيسية" to="/" end><House size={21} aria-hidden="true" /> الرئيسية</NavLink>
        <NavLink to="/orders"><Package size={21} aria-hidden="true" /> الطلبات</NavLink>
        <NavLink to="/cart"><ShoppingBag size={21} aria-hidden="true" /> السلة</NavLink>
        <NavLink to="/account"><UserRound size={21} aria-hidden="true" /> حسابي</NavLink>
      </nav>}
      <footer>
        <div className="container footer">
          <span>غزة إكسبرس</span>
          <span>من متجرك المفضّل، إلى بابك.</span>
        </div>
      </footer>
    </>
  );
}
