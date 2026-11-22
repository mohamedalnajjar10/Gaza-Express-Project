import { RewardsCard } from './rewards';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { AccountAvatar } from './account-avatar';
import { ProfileEditor } from './profile-editor';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpLeft,
  Bell,
  ClipboardList,
  Heart,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  UserRound,
} from 'lucide-react';
import { useIdentity } from '../../shared/auth/identity';
import { ActionForm } from '../../shared/ui/form';
import type { Role } from '../../shared/auth/types';
import '../../styles/account.css';

const accountRoles = {
  customer: {
    label: 'عميل',
    title: 'كل ما يخصّك، في مكان واحد',
    detail: 'بياناتك وطلباتك وعناوينك، لتجربة تسوّق أسهل.',
    icon: ShoppingBag,
  },
  store_owner: {
    label: 'صاحب متجر',
    title: 'حسابك، نقطة انطلاق أعمالك',
    detail: 'راجع بياناتك وانتقل بسهولة إلى متاجرك وطلباتك.',
    icon: Store,
  },
  driver: {
    label: 'سائق توصيل',
    title: 'حسابك جاهز لرحلتك القادمة',
    detail: 'بياناتك ومهامك وإشعاراتك، في مساحة واحدة.',
    icon: Truck,
  },
  admin: {
    label: 'مدير النظام',
    title: 'حسابك ومساحة إدارتك',
    detail: 'وصول منظم إلى بيانات الحساب وأدوات الإدارة.',
    icon: ShieldCheck,
  },
} satisfies Record<
  Role,
  { label: string; title: string; detail: string; icon: typeof Store }
>;

export default function Account() {
  const { profile, logout } = useIdentity();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!profile) return null;
  const role = accountRoles[profile.role];
  const RoleIcon = role.icon;
  const name =
    profile.full_name_ar?.trim() || profile.full_name?.trim() || role.label;
  const phone =
    profile.phone && !profile.phone.startsWith('g_') ? profile.phone : null;
  const joined = profile.created_at ? new Date(profile.created_at) : null;
  const links = [
    {
      to: '/addresses',
      title: 'عنواني المحفوظ',
      detail: 'تعديل موقعك وتفاصيل الوصول',
      icon: MapPin,
    },
    {
      to: '/orders',
      title:
        profile.role === 'driver'
          ? 'مهام التوصيل'
          : profile.role === 'customer'
            ? 'طلباتي'
            : 'متابعة الطلبات',
      detail:
        profile.role === 'driver'
          ? 'العروض الجديدة وسجل التوصيل'
          : 'حالات الطلبات وتفاصيلها',
      icon: ClipboardList,
    },
    ...(profile.role === 'customer'
      ? [
          {
            to: '/favorites',
            title: 'المفضلة',
            detail: 'متاجرك المفضلة بالقرب منك',
            icon: Heart,
          },
        ]
      : [
          {
            to: '/operations',
            title:
              profile.role === 'store_owner' ? 'متاجري ومنتجاتي' : 'لوحة العمل',
            detail:
              profile.role === 'store_owner'
                ? 'متاجرك ومنتجاتك وحالة التوفر'
                : 'أدواتك اليومية في مكان واحد',
            icon: LayoutDashboard,
          },
        ]),
    {
      to: '/notifications',
      title: 'الإشعارات',
      detail: 'آخر التحديثات المتعلقة بحسابك',
      icon: Bell,
    },
  ];
  return (
    <div className={`account-page account-page--${profile.role}`}>
      <header className="account-heading">
        <span>مساحتك الشخصية</span>
        <h1>حسابي</h1>
        <p>{role.detail}</p>
      </header>
      <div className="account-layout">
        <aside className="account-profile-card" aria-label="ملخص الحساب">
          <div className="account-profile-cover" aria-hidden="true">
            <RoleIcon size={70} strokeWidth={1} />
          </div>
          <div className="account-profile-content">
            <AccountAvatar src={profile.profile_photo_url} name={name} />
            <h2>{name}</h2>
            <span className="account-role">
              <RoleIcon size={15} aria-hidden="true" />
              {role.label}
            </span>
            {joined && !Number.isNaN(joined.getTime()) && (
              <p className="account-joined">
                عضو منذ{' '}
                {joined.toLocaleDateString('ar-PS', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
            <nav className="account-section-nav" aria-label="أقسام حسابي">
              <a href="#account-personal">
                <UserRound size={18} aria-hidden="true" />
                المعلومات الشخصية
              </a>
              <a href="#account-shortcuts">
                <LayoutDashboard size={18} aria-hidden="true" />
                الوصول السريع
              </a>
              <a href="#account-session">
                <ShieldCheck size={18} aria-hidden="true" />
                إدارة الجلسة
              </a>
            </nav>
            <div className="account-profile-note">
              <ShieldCheck size={21} aria-hidden="true" />
              <p>حساب واحد للوصول إلى خدمات غزة إكسبرس.</p>
            </div>
          </div>
        </aside>
        <div className="account-main">
          <div className="account-welcome">
            <div>
              <span>أهلًا بك، {name.split(/\s+/)[0]}</span>
              <h2>{role.title}</h2>
            </div>
            <RoleIcon size={38} strokeWidth={1.4} aria-hidden="true" />
          </div>
          <section
            id="account-personal"
            className="account-panel"
            aria-labelledby="account-personal-title"
          >
            <header className="account-panel-heading">
              <span className="account-icon">
                <UserRound size={22} aria-hidden="true" />
              </span>
              <div>
                <h2 id="account-personal-title">المعلومات الشخصية</h2>
                <p>بيانات حسابك المسجّلة في غزة إكسبرس.</p>
              </div>
              {!editing && (
                <button
                  className="secondary account-edit-trigger"
                  onClick={() => {
                    setEditing(true);
                    setSaved(false);
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                  تعديل البيانات
                </button>
              )}
            </header>
            {saved && (
              <p className="account-save-success" role="status">
                تم تحديث الاسم والبريد والصورة بنجاح.
              </p>
            )}
            {editing ? (
              <ProfileEditor
                onSaved={() => {
                  setEditing(false);
                  setSaved(true);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <dl className="account-details">
                <div>
                  <dt>الاسم الكامل</dt>
                  <dd>{name}</dd>
                </div>
                <div>
                  <dt>نوع الحساب</dt>
                  <dd>{role.label}</dd>
                </div>
                <div>
                  <dt>
                    <Smartphone size={15} aria-hidden="true" />
                    رقم الهاتف
                  </dt>
                  <dd>
                    {phone ? (
                      <bdi dir="ltr">{phone}</bdi>
                    ) : (
                      <span className="account-unset">غير مضاف</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Mail size={15} aria-hidden="true" />
                    البريد الإلكتروني
                  </dt>
                  <dd>
                    {profile.email ? (
                      <bdi dir="ltr">{profile.email}</bdi>
                    ) : (
                      <span className="account-unset">غير مضاف</span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </section>
          {profile.role === 'customer' && <RewardsCard />}
          <section
            id="account-shortcuts"
            className="account-panel"
            aria-labelledby="account-shortcuts-title"
          >
            <header className="account-panel-heading">
              <span className="account-icon">
                <LayoutDashboard size={22} aria-hidden="true" />
              </span>
              <div>
                <h2 id="account-shortcuts-title">الوصول السريع</h2>
                <p>اختصارات لما تحتاجه في يومك.</p>
              </div>
            </header>
            <div className="account-shortcuts">
              {links.map(({ to, title, detail, icon: Icon }) => (
                <Link to={to} key={to}>
                  <span className="account-shortcut-icon">
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                  <ArrowUpLeft size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
          <section
            id="account-session"
            className="account-panel account-session"
            aria-labelledby="account-session-title"
          >
            <header className="account-panel-heading">
              <span className="account-icon">
                <ShieldCheck size={22} aria-hidden="true" />
              </span>
              <div>
                <h2 id="account-session-title">إدارة الجلسة</h2>
                <p>تحكّم بوصولك إلى حسابك من هذا المتصفح.</p>
              </div>
            </header>
            <div className="account-session-row">
              <span className="account-session-device">
                <Smartphone size={23} aria-hidden="true" />
              </span>
              <div>
                <strong>الجلسة الحالية</strong>
                <p>أنت تستخدم هذا الحساب الآن.</p>
              </div>
              <span className="account-session-badge">مسجّل الدخول</span>
            </div>
            <div className="account-logout">
              <div>
                <strong>
                  <LogOut size={17} aria-hidden="true" />
                  تسجيل الخروج من الحساب
                </strong>
                <p>يمكنك العودة في أي وقت بتسجيل الدخول من جديد.</p>
              </div>
              <ActionForm
                label="تسجيل الخروج"
                submit={async () => {
                  try {
                    await logout();
                  } finally {
                    navigate('/login', { replace: true });
                  }
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
