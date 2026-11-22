import { test, expect } from '@playwright/test';

for (const [role, label] of Object.entries({
  customer: 'عميل',
  store_owner: 'صاحب متجر',
  driver: 'سائق توصيل',
  admin: 'مدير النظام',
})) {
  test(`account profile and logout for ${role}`, async ({ page }, info) => {
    let loggedOut = false;
    let saves = 0;
    const avatar =
      '/api/v1/account/images/11111111-1111-1111-1111-111111111111.webp';
    const imageBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK2sAAAAASUVORK5CYII=',
      'base64',
    );
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        '/api/v1',
        '',
      );
      let data: unknown = [];
      if (path === '/auth/login')
        data = {
          tokens: {
            access_token: 'fixture-access',
            refresh_token: 'fixture-refresh',
          },
        };
      else if (path === '/auth/profile')
        data = {
          user_id: 1,
          role,
          full_name: 'أحمد محمد',
          phone: role === 'customer' ? 'g_example' : '0591234567',
          email: role === 'driver' ? null : 'ahmed@example.com',
          created_at: '2026-06-01T00:00:00Z',
        };
      else if (path === '/account/profile') {
        expect(route.request().method()).toBe('PATCH');
        expect(route.request().headers()['content-type']).toMatch(
          /^multipart\/form-data/,
        );
        const body = route.request().postData() || '';
        expect(body).toContain('أحمد الجديد');
        expect(body).toContain('new@example.com');
        expect(body).toContain('filename="avatar.png"');
        saves++;
        if (saves === 1)
          return route.fulfill({
            status: 409,
            json: {
              success: false,
              message: 'البريد الإلكتروني مستخدم في حساب آخر.',
            },
          });
        data = {
          user_id: 1,
          role,
          full_name: 'أحمد الجديد',
          full_name_ar: 'أحمد الجديد',
          phone: '0591234567',
          email: 'new@example.com',
          profile_photo_url: avatar,
        };
      } else if (path.startsWith('/account/images/')) {
        expect(route.request().headers().authorization).toBe(
          'Bearer fixture-access',
        );
        return route.fulfill({ contentType: 'image/png', body: imageBytes });
      } else if (path === '/stores')
        data = { data: [], meta: { total: 0, page: 1, totalPages: 0 } };
      else if (path === '/auth/logout') {
        expect(route.request().postDataJSON()).toEqual({
          refresh_token: 'fixture-refresh',
        });
        loggedOut = true;
        data = {};
      }
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
    const account = page.locator('.account-page');
    await expect(
      account.getByRole('heading', { name: 'حسابي', exact: true }),
    ).toBeVisible();
    await expect(account.locator('.account-role')).toHaveText(label);
    await expect(account.locator('dd').first()).toHaveText('أحمد محمد');
    if (role === 'customer') {
      await expect(account.getByText('g_example')).toHaveCount(0);
      await expect(
        account.getByRole('link', { name: /عنواني المحفوظ/ }),
      ).toHaveAttribute('href', '/addresses');
    } else {
      await expect(
        account.getByRole('link', { name: /عناوين التوصيل/ }),
      ).toHaveCount(0);
      await expect(account.locator('a[href="/operations"]')).toHaveCount(1);
    }
    await account.getByRole('button', { name: 'تعديل البيانات' }).click();
    await account
      .getByLabel('الاسم الكامل', { exact: true })
      .fill('تغيير ملغى');
    await account.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expect(account.locator('dd').first()).toHaveText('أحمد محمد');
    expect(saves).toBe(0);
    await account.getByRole('button', { name: 'تعديل البيانات' }).click();
    await account
      .getByLabel('الاسم الكامل', { exact: true })
      .fill('أحمد الجديد');
    await account.getByLabel('البريد الإلكتروني').fill('new@example.com');
    await account
      .getByLabel('الصورة الشخصية', { exact: true })
      .setInputFiles({
        name: 'bad.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg/>'),
      });
    await expect(account.getByRole('alert')).toContainText('اختر صورة');
    await account
      .getByLabel('الصورة الشخصية', { exact: true })
      .setInputFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: imageBytes,
      });
    await page.screenshot({
      path: info.outputPath('account-edit.png'),
      fullPage: true,
    });
    await account.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expect(account.getByRole('alert')).toContainText(
      'البريد الإلكتروني مستخدم',
    );
    await expect(
      account.getByLabel('الاسم الكامل', { exact: true }),
    ).toHaveValue('أحمد الجديد');
    await account.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expect(account.getByRole('status')).toContainText('تم تحديث');
    await expect(account.locator('dd').first()).toHaveText('أحمد الجديد');
    await expect(
      account.getByRole('img', { name: 'الصورة الشخصية لـ أحمد الجديد' }),
    ).toBeVisible();
    await expect(
      account.getByText('new@example.com', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('banner').locator('.header-avatar img')).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('أحمد الجديد');
    expect(saves).toBe(2);
    await page.screenshot({
      path: info.outputPath(`account-${role}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await account
      .getByRole('link', { name: 'إدارة الجلسة', exact: true })
      .click();
    await expect(page).toHaveURL(/#account-session$/);
    await account
      .getByRole('button', { name: 'تسجيل الخروج', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    expect(loggedOut).toBe(true);
    await page.goto('/account');
    await expect(
      page.getByRole('button', { name: 'تسجيل الدخول', exact: true }),
    ).toBeVisible();
  });
}
