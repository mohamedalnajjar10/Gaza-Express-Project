import {
  Bell, Boxes, ClipboardList, LayoutDashboard, ListChecks, MessageSquare,
  Store, Truck, Users, UserRound,
} from 'lucide-react';

export const workspaces = {
  store_owner: {
    title: 'لوحة المتجر',
    links: [
      { label: 'متاجري ومنتجاتي', to: '/operations', icon: Store },
      { label: 'طلبات متاجري', to: '/orders', icon: ClipboardList },
    ],
  },
  driver: {
    title: 'لوحة السائق',
    links: [
      { label: 'التوفر للتوصيل', to: '/operations', icon: Truck },
      { label: 'مهام التوصيل', to: '/orders', icon: ListChecks },
    ],
  },
  admin: {
    title: 'لوحة الإدارة',
    links: [
      { label: 'مراجعة المتاجر', to: '/operations', icon: LayoutDashboard },
      { label: 'تصنيفات المتاجر', to: '/operations?tab=categories', icon: Boxes },
      { label: 'الحسابات والسائقون', to: '/operations?tab=users', icon: Users },
      { label: 'طابور الرسائل', to: '/operations?tab=sms', icon: MessageSquare },
      { label: 'الطلبات والمدفوعات', to: '/orders', icon: ClipboardList },
    ],
  },
};

export const workspaceAccountLinks = [
  { label: 'الإشعارات', to: '/notifications', icon: Bell },
  { label: 'حسابي', to: '/account', icon: UserRound },
];
