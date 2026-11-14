import { expect, test, type Page, type Route } from '@playwright/test';

const store = { storeId: 1, storeNameAr: 'متجر الاختبار', isOpenNow: true, avgRating: 4.8, estimatedPrepMin: 20 };
const product = { productId: 2, storeId: 1, nameAr: 'خبز طازج', estimatedPriceMin: '12', estimatedPriceMax: '12', isPriceFixed: true, isAvailable: true, productOptions: [] };
const order = { id: 51, storeId: 1, status: 'PENDING', storeName: 'متجر الاختبار', version: 1, estimatedMin: '12', currency: 'ILS', paymentMethod: 'CASH', itemSnapshots: [{ ...product, quantity: 1 }] };
const address = { id: 5, label: 'البيت', address: 'عنوان الاختبار' };
const tokens = { access_token: 'browser-fixture-access', refresh_token: 'browser-fixture-refresh' };
const success = (route: Route, data: unknown) => route.fulfill({ json: { success: true, data } });

async function signIn(page: Page, destination: string) {
  await page.goto(destination);
  await page.getByLabel('رقم الهاتف').fill('0591234567');
  await page.getByLabel('كلمة المرور').fill('TestPassword123!');
  await page.getByRole('button', {name:'تسجيل الدخول',exact:true}).click();
}

test('customer searches, adds a product, checks out and cancels', async ({page}) => {
  let items: unknown[] = [];
  let version = 0;
  let submitted = 0;
  let status = 'PENDING';
  let catalogRequests = 0;
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1','');
    const method = request.method();
    if (path.startsWith('/stores') || path.startsWith('/products') || path === '/store-categories') {
      catalogRequests++;
      expect(request.headers().authorization).toBe(`Bearer ${tokens.access_token}`);
    }
    if (path === '/auth/login') return success(route, {tokens});
    if (path === '/auth/profile') return success(route, {user_id:10,role:'customer',full_name:'عميل تجريبي'});
    if (path === '/stores') return success(route, {data:[store],meta:{page:1,totalPages:1,total:1}});
    if (path === '/store-categories') return success(route, []);
    if (path === '/stores/1') return success(route, {...store,productCategories:[{products:[product]}],reviews:[]});
    if (path === '/products/store/1') return success(route, [{...product,imageUrl:'/api/v1/products/images/9961c615-96cb-4a6e-b3f2-2f403e0e2944.webp'}]);
    if (path.startsWith('/products/images/')) return route.fulfill({
      contentType:'image/png',
      body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK2sAAAAASUVORK5CYII=','base64'),
    });
    if (path === '/cart') {
      if (method === 'PUT') { expect(request.postDataJSON().version).toBe(version++); items = request.postDataJSON().items; }
      return success(route,{version,storeId:items.length ? 1 : null,items,products:[product]});
    }
    if (path === '/addresses') return success(route,[address]);
    if (path === '/orders') {
      submitted++;
      expect(request.headers()['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
      expect(request.postDataJSON()).toEqual({addressId:5,cartVersion:1,paymentMethod:'CASH'});
      return success(route,order);
    }
    if (path === '/orders/51/status') {
      expect(request.postDataJSON()).toEqual({action:'cancel',reason:'تغيير العنوان',version:1});
      status = 'CANCELLED';
      return success(route,{...order,status,version:2});
    }
    if (path === '/orders/51') return success(route,{...order,status});
    throw new Error(`Unexpected ${method} ${path}`);
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/stores/1');
  await expect(page).toHaveURL(/\/login$/);
  expect(catalogRequests).toBe(0);
  await signIn(page, '/addresses');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(page.getByRole('navigation', {name:'التنقل الرئيسي'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('searchbox').or(page.getByLabel('ابحث عن متجر')).fill('متجر');
  await page.getByRole('button',{name:'بحث',exact:true}).click();
  await expect(page).toHaveURL(/search=/);
  await page.getByRole('link',{name:/متجر الاختبار/}).click();
  await expect(page.locator('.product-card img')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button',{name:'عرض المنتج'}).click();
  await page.getByRole('button',{name:'أضف إلى السلة'}).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('heading', {name:'سلّتك',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:product.nameAr})).toBeVisible();
  await page.getByRole('link',{name:'المتابعة إلى الدفع'}).click();
  await page.getByRole('button',{name:'تأكيد الطلب'}).click();
  await expect(page.getByRole('heading',{name:'طلب #51'})).toBeVisible();
  expect(submitted).toBe(1);
  await page.getByText('إلغاء الطلب',{exact:true}).click();
  await page.getByLabel('السبب').fill('تغيير العنوان');
  await page.getByRole('button',{name:'تأكيد الإلغاء'}).click();
  await expect(page.getByText('ملغى',{exact:true})).toBeVisible();
  expect(failures).toEqual([]);
});

test('driver completes delivery with code and collected amount', async ({page}) => {
  let status = 'IN_TRANSIT';
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1','');
    if (path === '/auth/login') return success(route,{tokens});
    if (path === '/auth/profile') return success(route,{user_id:11,role:'driver',full_name:'سائق تجريبي'});
    if (path === '/orders/51/status') {
      expect(route.request().postDataJSON()).toEqual({action:'deliver',deliveryCode:'005123',collectedAmount:12,version:1});
      status='DELIVERED';
    }
    if (path.startsWith('/orders/51')) return success(route,{...order,status,finalTotal:'12'});
    throw new Error(`Unexpected ${path}`);
  });
  await signIn(page,'/orders/51');
  await expect(page.getByRole('navigation', {name:'تنقل لوحة السائق'}).getByRole('link', {name:'مهام التوصيل'})).toHaveAttribute('aria-current','page');
  await expect(page.getByText('إلغاء الطلب',{exact:true})).toHaveCount(0);
  await page.getByLabel('رمز العميل').fill('005123');
  await page.getByLabel('المبلغ المحصّل (ILS)').fill('12');
  await page.getByRole('button',{name:'تأكيد التسليم'}).click();
  await expect(page.getByText('تم التسليم',{exact:true})).toBeVisible();
});

test('admin adds the first store category and owner submits a store', async ({ page, context }) => {
  const ownerPage = await context.newPage();
  const categories: { categoryId: number; nameAr: string }[] = [];
  const stores: object[] = [];
  async function mock(route: Route, role: string) {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/login') return success(route, { tokens });
    if (path === '/auth/profile') return success(route, { user_id: 10, role });
    if (path === '/stores/moderation' || path === '/stores/my-stores') return success(route, stores);
    if (path === '/store-categories') {
      if (request.method() === 'POST') {
        expect(role).toBe('admin');
        expect(request.postDataJSON()).toEqual({ nameAr: 'مطاعم' });
        categories.push({ categoryId: 1, nameAr: 'مطاعم' });
      }
      return success(route, categories);
    }
    if (path === '/stores' && request.method() === 'POST') {
      expect(role).toBe('store_owner');
      expect(request.postDataJSON()).toMatchObject({ categoryId: 1, areaId: 1, latitude: 31.5, longitude: 34.45 });
      stores.push({ ...request.postDataJSON(), storeId: 1, status: 'PENDING_APPROVAL', isOpenNow: true });
      return success(route, stores[0]);
    }
    throw new Error(`Unexpected ${request.method()} ${path}`);
  }
  await ownerPage.route('**/api/v1/**', route => mock(route, 'store_owner'));
  await signIn(ownerPage, '/operations');
  await ownerPage.getByText('إضافة متجر', { exact: true }).click();
  await expect(ownerPage.getByRole('button', { name: 'تحديث التصنيفات' })).toBeVisible();
  await page.route('**/api/v1/**', route => mock(route, 'admin'));
  await signIn(page, '/login');
  await expect(page).toHaveURL(/\/operations$/);
  await expect(page.getByRole('navigation', {name:'تنقل لوحة الإدارة'})).toBeVisible();
  await page.getByRole('link', { name: 'تصنيفات المتاجر' }).click();
  await expect(page).toHaveURL(/tab=categories$/);
  await expect(page.getByRole('link', { name: 'تصنيفات المتاجر' })).toHaveAttribute('aria-current', 'page');
  await page.getByLabel('اسم التصنيف بالعربية').fill('مطاعم');
  await page.getByRole('button', { name: 'حفظ التصنيف' }).click();
  await expect(page.getByRole('status')).toHaveText('تم حفظ التصنيف «مطاعم».');
  await ownerPage.getByRole('button', { name: 'تحديث التصنيفات' }).click();
  await ownerPage.getByLabel('اسم المتجر بالعربية').fill('متجر تجريبي');
  await ownerPage.getByLabel('اسم المتجر بالإنجليزية').fill('Test store');
  await ownerPage.getByLabel('رقم المنطقة').fill('1');
  await ownerPage.getByLabel('خط العرض').fill('31.5');
  await ownerPage.getByLabel('خط الطول').fill('34.45');
  await ownerPage.getByRole('button', { name: 'حفظ المتجر' }).click();
  await expect(ownerPage.getByRole('heading', { name: 'متجر تجريبي' })).toBeVisible();
});

test('store owner creates a section and saves a product with a multipart image', async ({ page }) => {
  const section = { prodCategoryId: 2, nameAr: 'المخبوزات' };
  let hasSection = false;
  let savedProduct: object | null = null;
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/login') return success(route, { tokens });
    if (path === '/auth/profile') return success(route, { user_id: 10, role: 'store_owner' });
    if (path === '/stores/my-stores') return success(route, [{ ...store, status: 'ACTIVE' }]);
    if (path === '/store-categories') return success(route, [{ categoryId: 1, nameAr: 'مخابز' }]);
    if (path === '/product-categories') {
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ storeId: 1, nameAr: section.nameAr });
        hasSection = true;
        return success(route, section);
      }
      return success(route, hasSection ? [section] : []);
    }
    if (path === '/products/store/1') return success(route, savedProduct ? [savedProduct] : []);
    if (path === '/products' && request.method() === 'POST') {
      expect(request.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
      const body = request.postData();
      for (const [name, value] of Object.entries({ storeId: '1', prodCategoryId: '2', estimatedPriceMin: '12', estimatedPriceMax: '12', isPriceFixed: 'true' })) {
        expect(body).toContain(`name="${name}"\r\n\r\n${value}\r\n`);
      }
      expect(body).toContain('name="image"; filename="bread.png"');
      savedProduct = { ...product, productCategory: section, prodCategoryId: 2 };
      return success(route, savedProduct);
    }
    throw new Error(`Unexpected ${request.method()} ${path}`);
  });
  await signIn(page, '/operations');
  const navigation = page.getByRole('navigation', {name:'تنقل لوحة المتجر'});
  await expect(navigation.getByRole('link', {name:'متاجري ومنتجاتي'})).toBeVisible();
  await expect(navigation.getByRole('link', {name:'طابور الرسائل'})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button', { name: 'إدارة المنتجات' }).click();
  await page.getByText('أقسام المنتجات', { exact: true }).click();
  await page.getByLabel('اسم القسم بالعربية').fill(section.nameAr);
  await page.getByRole('button', { name: 'إضافة قسم' }).click();
  await expect(page.getByRole('listitem').getByText(section.nameAr, { exact: true })).toBeVisible();
  await page.getByText('إضافة منتج', { exact: true }).click();
  await page.getByLabel('اسم المنتج بالعربية').fill(product.nameAr);
  await page.getByLabel('اسم المنتج بالإنجليزية').fill('Fresh bread');
  await page.getByLabel('قسم المنتج').selectOption('2');
  await page.getByLabel('السعر (₪)', { exact: true }).fill('12');
  await page.getByLabel('صورة المنتج', { exact: true }).setInputFiles({
    name: 'bread.png', mimeType: 'image/png', buffer: Buffer.from('test image'),
  });
  await page.getByRole('button', { name: 'حفظ المنتج' }).click();
  await expect(page.getByRole('heading', { name: product.nameAr })).toBeVisible();
});
