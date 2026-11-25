import { expect, test } from '@playwright/test';

test('sign-in offers a retry when its script fails to download', async ({ page }) => {
  const authScript = /\/assets\/auth-page-[^/]+\.js$/;
  await page.route(authScript, route => route.abort('connectionreset'));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل الصفحة' })).toBeVisible();
  await page.unroute(authScript);
  await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.getByLabel('رقم الهاتف')).toBeVisible();
});
