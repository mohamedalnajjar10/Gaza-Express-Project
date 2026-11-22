import { lazy } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { IdentityProvider, useIdentity } from '../shared/auth/identity';
import { Layout } from './layout';
import CatalogPage from '../features/catalog/catalog-page';
import { DriverLocationProvider } from '../features/operations/driver-location';

const StorePage = lazy(() => import('../features/catalog/store-page'));
const Auth = lazy(() => import('../features/auth/auth-page'));
const Cart = lazy(() => import('../features/cart/cart-page'));
const Checkout = lazy(() => import('../features/checkout/checkout-page'));
const Addresses = lazy(() => import('../features/addresses/addresses-page'));
const Orders = lazy(() => import('../features/orders/orders-page'));
const OrderDetail = lazy(() => import('../features/orders/order-detail-page'));
const Favorites = lazy(() => import('../features/favorites/favorites-page'));
const Notifications = lazy(
  () => import('../features/notifications/notifications-page'),
);
const Account = lazy(() => import('../features/account/account-page'));
const Operations = lazy(() => import('../features/operations/operations-page'));

function Protected() {
  const { profile } = useIdentity();
  const location = useLocation();
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (profile.role === 'customer' && profile.addressPromptedAt === null && location.pathname !== '/addresses' && location.pathname !== '/checkout') {
    return <Navigate to="/addresses" replace state={{ from: location.pathname + location.search, fromState: location.state, onboarding: true }} />;
  }
  return profile.role === 'driver' ? (
    <DriverLocationProvider key={profile.user_id}><Outlet /></DriverLocationProvider>
  ) : <Outlet />;
}

function CustomerOnly() {
  const { profile } = useIdentity();
  return profile?.role === 'customer' ? <Outlet /> : <Navigate to="/operations" replace />;
}

function StaffOnly() {
  const { profile } = useIdentity();
  return profile?.role === 'customer' ? <Navigate to="/account" replace /> : <Outlet />;
}

export default function App() {
  return (
    <IdentityProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="login" element={<Auth mode="login" />} />
            <Route path="register" element={<Auth mode="register" />} />
            <Route path="verify" element={<Auth mode="verify" />} />
            <Route path="auth/success" element={<Auth mode="google" />} />
            <Route path="auth/error" element={<Auth mode="error" />} />
            <Route element={<Protected />}>
              <Route index element={<CatalogPage />} />
              <Route path="stores/:id" element={<StorePage />} />
              <Route element={<CustomerOnly />}>
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="favorites" element={<Favorites />} />
              </Route>
              <Route path="addresses" element={<Addresses />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="account" element={<Account />} />
              <Route element={<StaffOnly />}>
                <Route path="operations" element={<Operations />} />
              </Route>
            </Route>
            <Route
              path="*"
              element={
                <div className="surface empty">
                  <h1>هذه الصفحة غير متاحة</h1>
                  <Link className="button" to="/">
                    العودة للمتاجر <ArrowLeft size={16} />
                  </Link>
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </IdentityProvider>
  );
}
