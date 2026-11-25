import { expect, test } from '@playwright/test';

const tokens = { access_token: 'favorites-test-access', refresh_token: 'favorites-test-refresh' };
const profile = { user_id: 7, role: 'customer', full_name: 'عميل الاختبار', addressPromptedAt: '2026-11-17T10:00:00Z' };

test('customer resumes the requested page after signing in', async ({ page }) => {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/login') ? { tokens } :
      path.endsWith('/auth/profile') ? profile : [];
    return route.fulfill({ json: { success: true, data } });
  });

  await page.goto('/favorites?view=saved#saved');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('رقم الهاتف').fill('0591234567');
  await page.getByLabel('كلمة المرور').fill('TestPassword123!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/favorites\?view=saved#saved$/);
  await expect(page.getByRole('heading', { name: 'المفضّلة' })).toBeVisible();
});

for (const { role, savedPage, destination, heading } of [
  { role: 'customer', savedPage: '/favorites?view=saved#saved', destination: /\/favorites\?view=saved#saved$/, heading: 'المفضّلة' },
  { role: 'admin', savedPage: '/operations?tab=users#team', destination: /\/operations\?tab=users#team$/, heading: 'لوحة الإدارة' },
  { role: 'store_owner', savedPage: '/operations/stores/2', destination: /\/operations$/, heading: 'لوحة المتجر' },
]) test(`Google callback routes ${role} and consumes the saved destination`, async ({ page }) => {
  const destinationKey = 'gaza-express.google-destination.v1';
  await page.addInitScript(({ key, path }) => {
    if (location.pathname === '/auth/success') sessionStorage.setItem(key, path);
  }, { key: destinationKey, path: savedPage });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/google/exchange') ? { tokens } :
      path.endsWith('/auth/profile') ? { ...profile, role } : [];
    return route.fulfill({ json: { success: true, data } });
  });

  await page.goto('/auth/success');
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), destinationKey)).toBeNull();
});

test('favorites supports later pages, switching tabs, and removing the last entry', async ({ page }) => {
  await page.addInitScript(session => sessionStorage.setItem('gaza-express.session.v1', JSON.stringify(session)), tokens);
  const stores = Array.from({ length: 26 }, (_, index) => ({
    storeId: index + 1,
    store: { storeName: `متجر ${index + 1}` },
  }));
  const products = Array.from({ length: 51 }, (_, index) => ({
    productId: index + 1,
    product: { nameAr: `منتج ${index + 1}`, storeId: 1 },
  }));
  const reads: string[] = [];
  await page.route('**/api/v1/**', route => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const success = (data: unknown) => route.fulfill({ json: { success: true, data } });
    if (pathname.endsWith('/auth/profile')) return success(profile);
    if (pathname.endsWith('/favorites/stores/26') && request.method() === 'DELETE') {
      stores.pop();
      return success({});
    }
    const pageNumber = Number(searchParams.get('page') || 1);
    const pageSize = Number(searchParams.get('limit') || 25);
    const offset = (pageNumber - 1) * pageSize;
    const rows = pathname.endsWith('/favorites/stores') ? stores :
      pathname.endsWith('/favorites/products') ? products : undefined;
    if (rows) {
      expect(pageSize).toBe(25);
      expect(searchParams.get('lookahead')).toBe('1');
      reads.push(`${pathname.split('/').pop()}:${pageNumber}`);
      return success(rows.slice(offset, offset + pageSize + 1));
    }
    throw new Error(`Unexpected favorites request: ${request.method()} ${pathname}`);
  });

  await page.goto('/favorites');
  const next = page.getByRole('button', { name: 'التالي' });
  await expect(page.getByRole('link', { name: 'متجر 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'متجر 26', exact: true })).toHaveCount(0);
  await next.click();
  await expect(page.getByRole('link', { name: 'متجر 26', exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'إزالة من المفضّلة' }).click();
  await expect(page.getByRole('link', { name: 'متجر 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'السابق' })).toBeDisabled();
  await expect(next).toBeDisabled();

  await page.getByRole('button', { name: 'المنتجات', exact: true }).click();
  await expect(page.getByRole('link', { name: 'منتج 1', exact: true })).toBeVisible();
  await next.click();
  await expect(page.getByRole('link', { name: 'منتج 26', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'منتج 51', exact: true })).toHaveCount(0);
  await next.click();
  await expect(page.getByRole('link', { name: 'منتج 51', exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'المتاجر', exact: true }).click();
  await expect(page.getByRole('link', { name: 'متجر 1', exact: true })).toBeVisible();
  expect(reads).toEqual(['stores:1', 'stores:2', 'stores:1', 'products:1', 'products:2', 'products:3', 'stores:1']);
});
