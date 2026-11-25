import { test, expect, type Page } from '@playwright/test';

const profile = { user_id: 77, full_name: 'سارة أحمد', role: 'customer', phone: '0591234567', addressPromptedAt: null as string | null, defaultAddressId: null as number | null };
const session = { access_token: 'address-test-access', refresh_token: 'address-test-refresh' };
type SavedAddress = Record<string, unknown> & { id: number };

async function fixture(page: Page) {
  const account = { ...profile };
  let saved: SavedAddress | undefined;
  const writes: Record<string, unknown>[] = [];
  await page.addInitScript(({ session }) => sessionStorage.setItem('gaza-express.session.v1', JSON.stringify(session)), { session });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.5017, longitude: 34.4668 });
  await page.route('**/api/v1/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/api/v1', '');
    const success = (data: unknown) => route.fulfill({ json: { success: true, data } });
    if (path === '/auth/profile') return success(account);
    if (path === '/auth/login') return success({ tokens: session });
    if (path === '/auth/logout') return success({});
    if (path === '/addresses/onboarding') { account.addressPromptedAt = '2026-11-17T10:00:00Z'; return success({ acknowledged: true }); }
    if (path === '/addresses/default' || (path === '/addresses/5' && req.method() === 'PUT')) {
      const body = req.postDataJSON();
      writes.push(body);
      saved = { ...body, id: 5 };
      account.defaultAddressId = 5;
      account.addressPromptedAt = '2026-11-17T10:00:00Z';
      return success(saved);
    }
    if (path === '/addresses/5' && req.method() === 'DELETE') { saved = undefined; account.defaultAddressId = null; return route.fulfill({ status: 204 }); }
    if (path === '/addresses') return success(saved ? [saved] : []);
    if (path === '/orders') return success({ orders: [], nextBefore: null });
    if (path === '/rewards') return success({ balance: 0, pointsRequired: 100 });
    if (path === '/cart') return success({ version: 3, storeId: 1, items: [{ productId: 1, quantity: 1 }], products: [] });
    if (path === '/store-categories') return success([]);
    if (path === '/stores') return success({ data: [], meta: { total: 0, totalPages: 1, page: 1 } });
    throw new Error(`Unexpected address request ${req.method()} ${path}`);
  });
  return { account, writes };
}

async function fillAddress(page: Page) {
  await page.getByLabel('المنطقة', { exact: true }).fill('غزة، الرمال');
  await page.getByRole('radio', { name: 'شقة', exact: true }).check();
  await page.getByLabel('المبنى ورقم الشقة').fill('مبنى ٢، شقة ٤');
  await page.getByLabel('الطابق (اختياري)').fill('الثاني');
  await page.getByLabel('الشارع', { exact: true }).fill('شارع الوحدة');
  await page.getByLabel('تعليمات إضافية (اختياري)').fill('بجوار الصيدلية');
  await page.getByLabel('اسم العنوان (اختياري)').fill('بيتي');
}

test('address onboarding can be skipped once, then saved at checkout and edited later', async ({ page, browserName }) => {
  const { writes } = await fixture(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'إضافة عنوانك' })).toBeVisible();
  await expect(page.getByLabel('خط العرض')).toHaveCount(0);
  await expect(page.getByLabel('خط الطول')).toHaveCount(0);
  await page.getByRole('button', { name: 'تخطي الآن' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/checkout');
  await fillAddress(page);
  await page.getByRole('heading', { name: 'إضافة عنوانك' }).click();
  if (browserName === 'chromium') await page.screenshot({ path: test.info().outputPath('address-form.png'), fullPage: true, scale: 'css' });
  await page.getByRole('button', { name: 'موقعي الحالي' }).click();
  await expect(page.getByText('تم تحديد الموقع', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'حفظ العنوان', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تأكيد الطلب', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ latitude: 31.5017, longitude: 34.4668, residenceType: 'APARTMENT', phone: '+970591234567', floor: 'الثاني' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'تأكيد الطلب', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إضافة عنوانك' })).toHaveCount(0);
  await page.goto('/addresses');
  await page.getByRole('button', { name: 'تعديل العنوان' }).click();
  await expect(page.getByLabel('المبنى ورقم الشقة')).toHaveValue('مبنى ٢، شقة ٤');
  await page.getByLabel('الطابق (اختياري)').fill('الثالث');
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ العنوان.');
  expect(writes).toHaveLength(2);
  expect(writes[1].floor).toBe('الثالث');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('manually saves the first checkout address when both location methods are unavailable', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.context().clearPermissions();
  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
  });
  await page.goto('/checkout');
  await fillAddress(page);
  await page.getByRole('button', { name: 'موقعي الحالي' }).click();
  await expect(page.getByRole('status')).toContainText('تعذّر تحديد الموقع');
  await page.getByRole('button', { name: 'حفظ العنوان', exact: true }).click();
  await expect(page.getByText('اختر موقع التوصيل للمتابعة.')).toBeVisible();
  await expect(page.getByLabel('المبنى ورقم الشقة')).toHaveValue('مبنى ٢، شقة ٤');
  await page.getByText('إدخال الإحداثيات يدويًا', { exact: true }).click();
  await page.getByLabel('خط العرض').fill('91');
  await page.getByLabel('خط الطول').fill('٣٤٫٤٦٦٨');
  await page.getByRole('button', { name: 'استخدام الإحداثيات' }).click();
  await expect(page.getByText(/أدخل خط عرض/)).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel('خط العرض').fill('٣١٫٥٠١٧');
  await page.getByRole('button', { name: 'استخدام الإحداثيات' }).click();
  await expect(page.getByText('تم تحديد الموقع', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'حفظ العنوان', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تأكيد الطلب', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ latitude: 31.5017, longitude: 34.4668 });
});

test('address can be selected directly on the Google map with reverse geocoding', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.addInitScript(() => {
    class FakeMap {
      constructor(private element: HTMLElement) {}
      panTo() {}
      setZoom() {}
      addListener(name: string, listener: (event: unknown) => void) {
        const click = () => listener({ latLng: { toJSON: () => ({ lat: 31.502312345, lng: 34.465912345 }) } });
        if (name === 'click') this.element.addEventListener('click', click);
        return { remove: () => this.element.removeEventListener('click', click) };
      }
    }
    class FakeGeocoder {
      async geocode() {
        return { results: [{
          address_components: [{ types: ['locality'], long_name: 'غزة' }, { types: ['route'], long_name: 'شارع عمر المختار' }],
        }] };
      }
    }
    Object.assign(window, { google: { maps: { Map: FakeMap, Geocoder: FakeGeocoder } } });
  });
  await page.goto('/addresses');
  await expect(page.getByLabel('البحث عن منطقة على الخريطة')).toBeVisible();
  await page.locator('.address-map-canvas').click({ position: { x: 100, y: 130 } });
  await expect(page.getByLabel('المنطقة', { exact: true })).toHaveValue('غزة');
  await expect(page.getByLabel('الشارع', { exact: true })).toHaveValue('شارع عمر المختار');
  await page.getByLabel('المبنى أو المنزل').fill('منزل ١٠');
  await page.getByRole('button', { name: 'حفظ العنوان', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تعديل العنوان' })).toBeVisible();
  expect(writes[0]).toMatchObject({ latitude: 31.50231234, longitude: 34.46591234, area: 'غزة', street: 'شارع عمر المختار' });
});
