import { test, expect } from '@playwright/test';

test('merchant filters stores products and orders with responsive layout', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stores = [
    {
      storeId: 1,
      storeName: 'Al Rimal',
      storeNameAr: 'سوبر ماركت الرمال',
      categoryId: 2,
      areaId: 1,
      fullAddressAr: 'شارع عمر المختار، بجوار البريد',
      status: 'ACTIVE',
      isOpenNow: true,
    },
    {
      storeId: 2,
      storeName: 'Bakery',
      storeNameAr: 'مخبز السنابل',
      categoryId: 4,
      areaId: 5,
      fullAddressAr: 'شارع السوق الرئيسي',
      status: 'PENDING_APPROVAL',
      isOpenNow: true,
    },
  ];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/auth/login')
      data = { tokens: { access_token: 'fixture', refresh_token: 'fixture' } };
    else if (path === '/auth/profile')
      data = { user_id: 10, role: 'store_owner', full_name: 'أحمد محمد' };
    else if (path === '/stores/my-stores') data = stores;
    else if (path === '/store-categories')
      data = ['مطاعم', 'سوبر ماركت', 'مول', 'مخبز', 'محل جوالات'].map(
        (nameAr, i) => ({ categoryId: i + 1, nameAr }),
      );
    else if (path === '/product-categories')
      data = [{ prodCategoryId: 1, nameAr: 'المخبوزات' }];
    else if (path === '/products/store/1')
      data = [
        {
          productId: 1,
          storeId: 1,
          nameAr: 'خبز طازج',
          isAvailable: true,
          isPriceFixed: true,
          estimatedPriceMin: '8',
          estimatedPriceMax: '8',
          productCategory: { prodCategoryId: 1, nameAr: 'المخبوزات' },
        },
        {
          productId: 2,
          storeId: 1,
          nameAr: 'كعك بالسمسم',
          isAvailable: false,
          isPriceFixed: true,
          estimatedPriceMin: '12',
          estimatedPriceMax: '12',
        },
      ];
    else if (path === '/orders')
      data = {
        orders: [
          { id: 51, storeName: 'سوبر ماركت الرمال', status: 'PENDING' },
          { id: 52, storeName: 'مخبز السنابل', status: 'DELIVERED' },
        ],
        nextBefore: null,
      };
    else throw new Error(`Unexpected request ${path}`);
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/operations');
  await page.getByLabel('رقم الهاتف').fill('0591234567');
  await page.getByLabel('كلمة المرور').fill('TestPassword123!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'سوبر ماركت الرمال', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('merchant-dashboard.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page
    .getByLabel('حالة المتجر', { exact: true })
    .selectOption('PENDING_APPROVAL');
  await expect(
    page.getByRole('heading', { name: 'سوبر ماركت الرمال', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('حالة المتجر', { exact: true }).selectOption('all');
  await page.getByLabel('البحث في متاجر الصفحة').fill('غير موجود');
  await expect(page.getByText('لا توجد متاجر تطابق بحثك')).toBeVisible();
  await page.getByLabel('البحث في متاجر الصفحة').fill('');
  await page.getByText('إضافة متجر', { exact: true }).click();
  await expect(
    page.locator('.owner-create').getByLabel('التصنيف').locator('option'),
  ).toHaveText(['مطاعم', 'سوبر ماركت', 'مول', 'مخبز', 'محل جوالات']);
  const fields = await page
    .locator('.owner-create input, .owner-create select')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('name')));
  expect(fields.indexOf('areaId')).toBeLessThan(
    fields.indexOf('fullAddressAr'),
  );
  await page.screenshot({
    path: info.outputPath('merchant-form.png'),
    fullPage: true,
  });
  await page.getByText('إضافة متجر', { exact: true }).click();
  await page
    .getByRole('button', { name: 'إدارة المنتجات', exact: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'خبز طازج' })).toBeVisible();
  await page.getByLabel('التوفر', { exact: true }).selectOption('unavailable');
  await expect(page.getByRole('heading', { name: 'خبز طازج' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'كعك بالسمسم' }),
  ).toBeVisible();
  await page.getByLabel('التوفر', { exact: true }).selectOption('all');
  await page.screenshot({
    path: info.outputPath('merchant-products.png'),
    fullPage: true,
  });
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'طلبات متاجري' })
    .click();
  await expect(page.getByText('طلب #51', { exact: true })).toBeVisible();
  await page
    .getByLabel('حالة الطلب', { exact: true })
    .selectOption('DELIVERED');
  await expect(page.getByText('طلب #51', { exact: true })).toHaveCount(0);
  await expect(page.getByText('طلب #52', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('merchant-orders.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});
