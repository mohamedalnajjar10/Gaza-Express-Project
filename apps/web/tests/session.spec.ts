import { test, expect } from '@playwright/test';
const key = 'gaza-express.session.v1';
const tokens = {
  access_token: 'original-access',
  refresh_token: 'original-refresh',
};
const rotated = {
  access_token: 'rotated-access',
  refresh_token: 'rotated-refresh',
};

for (const role of ['customer', 'store_owner', 'driver', 'admin']) {
  test(`reload restores ${role} and refreshes expired access without redirecting`, async ({
    page,
  }) => {
    let expired = false;
    let refreshes = 0;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        '/api/v1',
        '',
      );
      let data: unknown = [];
      if (path === '/auth/login') data = { tokens };
      else if (path === '/auth/profile') {
        if (
          expired &&
          route.request().headers().authorization === 'Bearer original-access'
        )
          return route.fulfill({
            status: 401,
            json: { success: false, message: 'Expired access' },
          });
        data = {
          user_id: 3,
          role,
          full_name: 'أحمد محمد',
          phone: '0591234567',
          addressPromptedAt: role === 'customer' ? 'done' : null,
        };
      } else if (path === '/auth/refresh') {
        expect(route.request().postDataJSON()).toEqual({
          refresh_token: tokens.refresh_token,
        });
        refreshes++;
        data = { tokens: rotated };
      } else if (path === '/stores')
        data = { data: [], meta: { total: 0, page: 1, totalPages: 0 } };
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/account');
    await page.getByLabel('رقم الهاتف').fill('0591234567');
    await page.getByLabel('كلمة المرور').fill('TestPassword123!');
    await page
      .getByRole('button', { name: 'تسجيل الدخول', exact: true })
      .click();
    if (role === 'customer')
      await page.getByRole('link', { name: 'حسابي', exact: true }).click();
    await expect(page.locator('.account-page')).toBeVisible();
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    await page.reload();
    await expect(page.locator('.account-page')).toBeVisible();
    expect(refreshes).toBe(0);
    expired = true;
    await page.reload();
    await expect(page.locator('.account-page')).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
    expect(refreshes).toBe(1);
    expect(navigations.some((url) => url.includes('/login'))).toBe(false);
    expect(
      await page.evaluate(
        (key) => JSON.parse(sessionStorage.getItem(key)!),
        key,
      ),
    ).toEqual(rotated);
    await page.reload();
    await expect(page.locator('.account-page')).toBeVisible();
    expect(refreshes).toBe(1);
    await page
      .getByRole('button', { name: 'تسجيل الخروج', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'تسجيل الدخول', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate((key) => sessionStorage.getItem(key), key),
    ).toBeNull();
    await page.goto('/account');
    await expect(
      page.getByRole('button', { name: 'تسجيل الدخول', exact: true }),
    ).toBeVisible();
  });
}

test('temporary restoration errors preserve the session and allow retry', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, tokens }) => sessionStorage.setItem(key, JSON.stringify(tokens)),
    { key, tokens },
  );
  let unavailable = true;
  await page.route('**/api/v1/auth/profile', (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          json: { success: false, message: 'Unavailable' },
        })
      : route.fulfill({
          json: {
            success: true,
            data: {
              user_id: 3,
              role: 'customer',
              full_name: 'أحمد محمد',
              phone: '0591234567',
            },
          },
        }),
  );
  await page.goto('/account');
  await expect(
    page.getByRole('heading', { name: 'تعذّر استعادة جلسة الدخول' }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), key),
  ).not.toBeNull();
  unavailable = false;
  await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.locator('.account-page')).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);
});

test('an invalid refresh token ends the session without a retry loop', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, tokens }) => sessionStorage.setItem(key, JSON.stringify(tokens)),
    { key, tokens },
  );
  let refreshes = 0;
  await page.route('**/api/v1/auth/**', (route) => {
    if (route.request().url().endsWith('/refresh')) refreshes++;
    return route.fulfill({
      status: 401,
      json: { success: false, message: 'Expired session' },
    });
  });
  await page.goto('/account');
  await expect(
    page.getByRole('button', { name: 'تسجيل الدخول', exact: true }),
  ).toBeVisible();
  expect(refreshes).toBe(1);
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), key),
  ).toBeNull();
});
