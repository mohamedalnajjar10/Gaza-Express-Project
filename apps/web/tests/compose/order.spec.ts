import { expect, test, type Page } from '@playwright/test';

type Fixture = {
  password: string;
  customer: string;
  owner: string;
  driver: string;
  storeId: number;
  storeName: string;
  productId: number;
};

function waitForResponse(page: Page, method: string, path: string) {
  return page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === `/api/v1${path}`);
}

async function signIn(page: Page, path: string, phone: string, password: string) {
  await page.goto(path);
  await page.getByLabel('رقم الهاتف').fill(phone);
  await page.getByLabel('كلمة المرور').fill(password);
  const loggedIn = waitForResponse(page, 'POST', '/auth/login');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  expect((await loggedIn).status()).toBe(200);
}

test('real customer order reaches cash delivery through the Compose gateway', async ({ page }, info) => {
  const fixtures = JSON.parse(process.env.WASLA_SMOKE_FIXTURE || '{}') as Record<string, Fixture>;
  const fixture = fixtures[info.project.name];
  if (!fixture) throw new Error('Run this test through infra/compose-smoke.sh to prepare isolated accounts');

  const owner = await page.context().newPage();
  const driver = await page.context().newPage();
  try {
    await signIn(page, '/favorites?view=saved#saved', fixture.customer, fixture.password);
    await expect(page).toHaveURL(/\/favorites\?view=saved#saved$/);
    await page.getByRole('button', { name: 'المنتجات', exact: true }).click();
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByRole('link', { name: 'خبز تجريبي', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'التالي' })).toBeDisabled();

    await page.goto('/');
    await page.getByRole('searchbox').or(page.getByLabel('ابحث عن متجر')).fill(fixture.storeName);
    await page.getByRole('button', { name: 'بحث', exact: true }).click();
    await page.getByRole('link', { name: new RegExp(fixture.storeName) }).click();
    await expect(page).toHaveURL(new RegExp(`/stores/${fixture.storeId}$`));
    await page.getByRole('button', { name: 'كل المنتجات', exact: true }).click();
    await page.getByLabel('البحث داخل المتجر').fill('منتج محفوظ');
    await page.locator('.store-search').getByRole('button', { name: 'بحث', exact: true }).click();
    await expect(page.locator('.store-product-tile')).toHaveCount(25);
    await expect(page.getByRole('button', { name: 'التالي' })).toBeDisabled();
    await page.getByRole('button', { name: 'كل المنتجات', exact: true }).click();
    const savedTile = page.locator('article').filter({ has: page.getByRole('heading', { name: 'خبز تجريبي', exact: true }) });
    await savedTile.getByText('تفاصيل المنتج', { exact: true }).click();
    await expect(savedTile.getByText('تم حفظ المنتج في المفضلة')).toBeVisible();
    await page.getByRole('button', { name: 'إضافة خبز تجريبي إلى السلة' }).click();
    await expect(page.locator('.store-cart-count')).toHaveText('1');
    await page.locator('.store-cart-bar').getByRole('link').click();
    await page.getByRole('link', { name: /المتابعة إلى الدفع/ }).click();
    await expect(page.getByText('عنوان التوصيل التجريبي', { exact: true })).toBeVisible();
    const checkout = waitForResponse(page, 'POST', '/orders');
    await page.getByRole('button', { name: 'تأكيد الطلب', exact: true }).click();
    const response = await checkout;
    expect(response.status()).toBe(201);
    const order = (await response.json()).data;
    expect(order.itemSnapshots[0].productId).toBe(fixture.productId);
    await expect(page.getByRole('heading', { name: `طلب #${order.id}` })).toBeVisible();

    await signIn(owner, '/notifications', fixture.owner, fixture.password);
    const notification = owner.getByRole('link', { name: new RegExp(`#${order.id}$`) });
    await expect(notification).toBeVisible();
    const markRead = owner.getByRole('button', { name: 'تمت القراءة' });
    await markRead.click();
    await expect(markRead).toHaveCount(0);
    await notification.click();
    const accepted = waitForResponse(owner, 'PATCH', `/orders/${order.id}/status`);
    await owner.getByRole('button', { name: 'قبول الطلب', exact: true }).click();
    const acceptResponse = await accepted;
    expect(acceptResponse.status()).toBe(200);
    const finalTotal = (await acceptResponse.json()).data.finalTotal;
    expect(Number(finalTotal)).toBeGreaterThan(0);

    await signIn(driver, `/orders/${order.id}`, fixture.driver, fixture.password);
    const claimed = waitForResponse(driver, 'PATCH', `/orders/${order.id}/status`);
    await driver.getByRole('button', { name: 'قبول مهمة التوصيل' }).click();
    expect((await claimed).status()).toBe(200);
    await owner.reload();
    await owner.getByRole('button', { name: 'الطلب جاهز للاستلام' }).click();
    await driver.bringToFront();
    await driver.getByRole('button', { name: 'استلمت الطلب من المتجر' }).click();

    await page.bringToFront();
    await page.getByRole('button', { name: 'عرض الرمز' }).click();
    const code = page.locator('output.delivery-code');
    await expect(code).toHaveText(/^[0-9]{6}$/);
    await driver.getByLabel('رمز العميل').fill((await code.textContent())!.trim());
    await driver.getByLabel('المبلغ المحصّل (ILS)').fill(String(finalTotal));
    const delivered = waitForResponse(driver, 'PATCH', `/orders/${order.id}/status`);
    await driver.getByRole('button', { name: 'تأكيد التسليم' }).click();
    expect((await delivered).status()).toBe(200);
    await expect(driver.getByText('تم التسليم', { exact: true }).first()).toBeVisible();

    const payment = await page.evaluate(async id => {
      const session = JSON.parse(sessionStorage.getItem('gaza-express.session.v1')!);
      const response = await fetch(`/api/v1/orders/${id}/payment`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      return { status: response.status, payment: (await response.json()).data };
    }, order.id);
    expect(payment.status).toBe(200);
    expect(payment.payment).toMatchObject({ status: 'PAID' });
  } finally {
    await Promise.all([owner.close(), driver.close()]);
  }
});
