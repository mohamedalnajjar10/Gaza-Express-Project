import { test, expect } from '@playwright/test';
async function session(page: import('@playwright/test').Page, role: string, respond: (path: string) => unknown) {
  await page.addInitScript(() => sessionStorage.setItem('gaza-express.session.v1', JSON.stringify({access_token:'qa',refresh_token:'qa'})));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1','');
    const data = path === '/auth/profile' ? {user_id:1,role,full_name:'QA',addressPromptedAt:'done'} : respond(path);
    return route.fulfill({json:{success:true,data}});
  });
}
const order = {id:1,storeId:1,storeName:'QA',version:1,status:'ASSIGNED',currency:'ILS',estimatedMin:'20',paymentMethod:'CASH'};
test('store pagination and saved product state use the API results', async ({ page }) => {
  const products = Array.from({ length: 26 }, (_, index) => ({
    productId: index + 1, nameAr: `منتج ${index + 1}`,
    estimatedPriceMin: '10', estimatedPriceMax: '10', isPriceFixed: true,
  }));
  await session(page, 'customer', path => {
    if (path === '/stores/1') return { storeId: 1, storeName: 'QA', productCategories: [] };
    if (path === '/cart') return { items: [], version: 0 };
    if (path === '/favorites/products/check/1') return true;
    if (path === '/favorites/stores/check/1') return false;
    return [];
  });
  await page.route(/\/api\/v1\/products\/store\/1\?/, route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('limit')).toBe('25');
    expect(query.get('lookahead')).toBe('1');
    const rows = query.get('q') ? products.slice(0, 25) : products;
    const offset = (Number(query.get('page')) - 1) * 25;
    return route.fulfill({ json: { success: true, data: rows.slice(offset, offset + 26) } });
  });
  await page.goto('/stores/1');
  await page.getByRole('button', { name: 'كل المنتجات', exact: true }).click();
  await expect(page.locator('.store-product-tile')).toHaveCount(25);
  await page.getByRole('button', { name: 'التالي' }).click();
  await expect(page.getByRole('heading', { name: 'منتج 26', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'التالي' })).toBeDisabled();
  await page.getByRole('button', { name: 'السابق' }).click();
  const tile = page.locator('.store-product-tile').filter({ has: page.getByRole('heading', { name: 'منتج 1', exact: true }) });
  await tile.getByText('تفاصيل المنتج', { exact: true }).click();
  await expect(tile.getByText('تم حفظ المنتج في المفضلة')).toBeVisible();
  await page.getByLabel('البحث داخل المتجر').fill('منتج');
  await page.locator('.store-search').getByRole('button', { name: 'بحث' }).click();
  await expect(page.locator('.store-product-tile')).toHaveCount(25);
  await expect(page.getByRole('button', { name: 'التالي' })).toBeDisabled();
});

test('notifications can return to the newer page', async ({ page }) => {
  await session(page, 'customer', () => ({}));
  await page.route('**/api/v1/notifications**', route => {
    const older = new URL(route.request().url()).searchParams.has('before');
    const id = older ? 1 : 2;
    return route.fulfill({ json: { success: true, data: {
      notifications: [{ id, orderId: id, createdAt: '2026-01-01', readAt: '2026-01-01' }],
      nextBefore: older ? null : 2,
    } } });
  });
  await page.goto('/notifications');
  await expect(page.getByRole('link', { name: /#2$/ })).toBeVisible();
  await page.getByRole('button', { name: 'عرض الأقدم' }).click();
  await expect(page.getByRole('link', { name: /#1$/ })).toBeVisible();
  await page.getByRole('button', { name: 'عرض الأحدث' }).click();
  await expect(page.getByRole('link', { name: /#2$/ })).toBeVisible();
});
for (const { role, label, destination, heading } of [
  { role: 'customer', label: 'عميل', destination: '/', heading: null },
  { role: 'store_owner', label: 'صاحب متجر', destination: '/operations', heading: 'لوحة المتجر' },
  { role: 'driver', label: 'سائق', destination: '/operations', heading: 'لوحة السائق' },
]) test(`registers and logs in to the ${role} workspace`, async ({ page }) => {
  const phone = '0591234567';
  const password = 'TestPassword123!';
  const tokens = { access_token: 'fixture', refresh_token: 'fixture' };
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/register')) {
      expect(route.request().postDataJSON()).toEqual({ phone, role });
    } else if (path.endsWith('/auth/verify-otp')) {
      expect(route.request().postDataJSON()).toMatchObject({ phone, role, code: '123456' });
      data = { tokens };
    } else if (path.endsWith('/auth/login')) {
      expect(route.request().postDataJSON()).toEqual({ phone, password });
      data = { tokens };
    } else if (path.endsWith('/auth/profile')) {
      data = { user_id: 1, role, full_name: 'حساب الاختبار', addressPromptedAt: '2026-01-01' };
    } else if (path.endsWith('/drivers/me/availability')) {
      data = { approved: false, available: false };
    } else if (path.endsWith('/stores')) {
      data = { data: [], meta: { page: 1, totalPages: 1, total: 0 } };
    }
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/register');
  await expect(page.getByRole('radio')).toHaveCount(3);
  await page.getByRole('radio', { name: label, exact: true }).check();
  await page.getByLabel('رقم الهاتف', { exact: true }).fill(phone);
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByLabel('رقم الهاتف', { exact: true })).toHaveValue(phone);
  await expect(page.getByText('نوع الحساب ' + label)).toBeVisible();
  await page.getByLabel('الاسم الكامل').fill('مستخدم الاختبار');
  await page.getByLabel('رمز التحقق').fill('123456');
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تحقّق من الرقم' }).click();
  await expect(page).toHaveURL(url => url.pathname === destination);
  if (heading) await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  if (role === 'driver') await expect(page.getByText('بانتظار اعتماد حساب السائق من الإدارة.')).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('gaza-express.session.v1'));
  await page.goto('/login');
  await page.getByLabel('رقم الهاتف', { exact: true }).fill(phone);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === destination);
  if (heading) await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
});

test('a live order signal updates the visible status without waiting for the polling interval', async ({ page }) => {
  let status = 'PENDING';
  let send!: () => void;
  const change = new Promise<void>(resolve => { send = resolve; });
  await session(page, 'customer', () => ({ ...order, status }));
  await page.route('**/api/v1/orders/updates', async route => {
    expect(route.request().headers().accept).toBe('text/event-stream');
    expect(route.request().headers().authorization).toBe('Bearer qa');
    await change;
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: ready\n\ndata: changed\n\n' });
  });
  await page.goto('/orders/1');
  await expect(page.getByText('بانتظار المتجر', { exact: true })).toBeVisible();
  status = 'ACCEPTED';
  send();
  await expect(page.getByText('تم استلام طلبك بنجاح وجارٍ التحضير.')).toBeVisible({ timeout: 4000 });
});

test('an approved driver can load offers by area without sharing location', async ({ page }) => {
  let area: number | null = null;
  await session(page, 'driver', path => {
    if (path === '/orders') return { orders: [], nextBefore: null };
    if (path === '/drivers/me/offers') return area === 1
      ? [{ ...order, status: 'ACCEPTED', offerOnly: true, openOffer: { pickupKm: null, nearby: true, canClaim: true } }]
      : [];
    return null;
  });
  await page.route('**/api/v1/drivers/me/availability', route => {
    if (route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ dispatchAreaId: 1 });
      area = 1;
    }
    return route.fulfill({ json: { success: true, data: { approved: true, available: true, dispatchAreaId: area } } });
  });
  await page.goto('/orders');
  await page.getByLabel('منطقة التوصيل عند تعذّر الموقع').selectOption('1');
  await page.getByRole('button', { name: 'حفظ منطقة التوصيل' }).click();
  await expect(page.getByText('ضمن منطقة التوصيل', { exact: true })).toBeVisible();
  await expect(page.getByText(/كم إلى المتجر/)).toHaveCount(0);
});

test('assigned driver sees delivery and pickup locations', async ({page}) => {
  await session(page,'driver',() => ({...order,addressSnapshot:{address:'عنوان العميل',phone:'+970591234567',latitude:'31.5',longitude:'34.4'},store:{fullAddressAr:'عنوان المتجر',latitude:'31.6',longitude:'34.5'}}));
  await page.goto('/orders/1');
  await expect(page.getByText('عنوان العميل',{exact:true})).toBeVisible();
  await expect(page.getByText('عنوان المتجر',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'فتح الملاحة إلى عنوان التوصيل'})).toHaveAttribute('href',/31.5%2C34.4/);
});
test('driver offer hides customer address even if included by a response',async ({page})=>{
  await session(page,'driver',()=>({...order,status:'READY',offerOnly:true,addressSnapshot:{address:'عنوان سري'}}));
  await page.goto('/orders/1');
  await expect(page.getByRole('heading',{name:'تفاصيل الطلب'})).toBeVisible();
  await expect(page.getByText('عنوان سري')).toHaveCount(0);
});

test('a nearby independent offer can be claimed while the order is still being prepared', async ({ page, context }) => {
  const offer = {
    ...order, status: 'ACCEPTED', offerOnly: true, openOffer: { pickupKm: 0.4, nearby: true, canClaim: true },
  };
  let claimed = false;
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 31.5, longitude: 34.4 });
  await session(page, 'driver', path => {
    if (path === '/drivers/me/offers') return [offer];
    if (path === '/orders') return { orders: [], nextBefore: null };
    return claimed ? { ...order, status: 'ACCEPTED', version: 2, driverId: 1 } : offer;
  });
  await page.route('**/api/v1/orders/1/status', route => {
    expect(route.request().postDataJSON()).toEqual({ action: 'claim_delivery', version: 1 });
    claimed = true;
    return route.fulfill({ json: { success: true, data: { id: 1, version: 2 } } });
  });
  await page.route('**/api/v1/drivers/me/location', route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({ latitude: 31.5, longitude: 34.4 });
    return route.fulfill({ status: 204 });
  });
  await page.goto('/orders');
  await page.getByRole('button', { name: 'مشاركة موقعي للتوصيل' }).click();
  await expect(page.getByText('موقعك محدّث.')).toBeVisible();
  await expect(page.getByText('طلب قريب منك', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /طلب #1/ }).click();
  await page.getByRole('button', { name: 'قبول مهمة التوصيل' }).click();
  await expect(page.getByText(/الطلب مسند إليك ويجري تحضيره/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'استلمت الطلب من المتجر' })).toHaveCount(0);
});

test('the merchant chooses a contracted company and then sees its assigned driver', async ({ page }) => {
  let accepted = false;
  await page.addInitScript(() => {
    class MapView {
      constructor(readonly element: HTMLElement) {}
      panTo() {}
    }
    class Marker {
      constructor({ map, position }: { map: MapView; position: { lat: number; lng: number } }) {
        map.element.dataset.driverPosition = `${position.lat},${position.lng}`;
      }
      setPosition() {}
      setMap() {}
    }
    Object.defineProperty(window, 'google', { value: { maps: { Map: MapView, Marker } } });
  });
  await session(page, 'store_owner', path => {
    if (path.endsWith('/driver-tracking')) return {
      driver: { name: 'سائق الشركة', phone: '+970591234567', location: { latitude: 31.5, longitude: 34.4, updatedAt: new Date().toISOString() } },
    };
    return accepted
      ? { ...order, status: 'ACCEPTED', version: 2, deliveryCompany: { name: 'شركة الاختبار' } }
      : { ...order, status: 'PENDING', deliveryCompanies: [{ id: 7, name: 'شركة الاختبار' }] };
  });
  await page.route('**/api/v1/orders/1/status', route => {
    expect(route.request().postDataJSON()).toEqual({ action: 'accept', version: 1, deliveryCompanyId: 7 });
    accepted = true;
    return route.fulfill({ json: { success: true, data: { id: 1, version: 2 } } });
  });
  await page.goto('/orders/1');
  const acceptance = page.locator('form').filter({ has: page.getByRole('button', { name: 'قبول الطلب', exact: true }) });
  await acceptance.getByRole('combobox', { name: 'طريقة التوصيل' }).selectOption('7');
  await acceptance.getByRole('button', { name: 'قبول الطلب' }).click();
  await expect(page.getByText('سائق الشركة', { exact: true })).toBeVisible();
  await expect(page.getByLabel('خريطة موقع السائق')).toHaveAttribute('data-driver-position', '31.5,34.4');
  await expect(page.getByRole('link', { name: 'فتح موقع السائق في الخرائط' })).toHaveAttribute('href', /31.5%2C34.4/);
});

test('the company manager accepts a contract request and assigns a company driver', async ({ page }) => {
  let confirmed = false;
  let assigned = false;
  await session(page, 'store_owner', path => path === '/delivery-companies/me/queue' ? {
    company: { id: 7, name: 'شركة الاختبار' },
    requests: confirmed ? [] : [{ storeId: 1, name: 'المتجر' }],
    orders: confirmed && !assigned ? [{ ...order, status: 'ACCEPTED' }] : [],
    drivers: [{ userId: 3, name: 'سائق الفريق' }],
  } : []);
  await page.route('**/api/v1/stores/1/delivery-contracts/7/confirm', route => {
    expect(route.request().method()).toBe('PUT');
    confirmed = true;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/orders/1/status', route => {
    expect(route.request().postDataJSON()).toEqual({ action: 'company_assign', version: 1, driverId: 3 });
    assigned = true;
    return route.fulfill({ json: { success: true, data: { id: 1, version: 2 } } });
  });
  await page.goto('/operations');
  await page.getByRole('button', { name: 'قبول التعاقد' }).click();
  await page.getByRole('combobox', { name: 'سائق الشركة' }).selectOption('3');
  await page.getByRole('button', { name: 'إسناد الطلب إلى السائق' }).click();
  await expect(page.getByText('لا توجد طلبات بانتظار الإسناد.')).toBeVisible();
});

test('the admin can reroute an unassigned order to independent delivery', async ({ page }) => {
  let rerouted = false;
  await session(page, 'admin', path => path === '/orders/1'
    ? { ...order, status: 'READY', driverId: null, deliveryCompanyId: rerouted ? null : 7,
      deliveryCompany: rerouted ? null : { name: 'شركة الاختبار' }, version: rerouted ? 2 : 1 }
    : null);
  await page.route('**/api/v1/orders/1/status', route => {
    expect(route.request().postDataJSON()).toEqual({ action: 'reroute_delivery', version: 1, reason: 'تعذّر الإسناد من الشركة' });
    rerouted = true;
    return route.fulfill({ json: { success: true, data: { id: 1, version: 2 } } });
  });
  await page.goto('/orders/1');
  await expect(page.getByText(/شركة الاختبار/)).toBeVisible();
  const submit = page.getByRole('button', { name: 'تحويل الطلب إلى سائق مستقل' });
  await page.locator('form').filter({ has: submit }).getByLabel('السبب').fill('تعذّر الإسناد من الشركة');
  await submit.click();
  await expect(page.getByRole('button', { name: 'عرض الطلب على السائق' })).toBeVisible();
  await expect(submit).toHaveCount(0);
});

test('all products shows a new product without sales or categories', async ({page})=>{
 await session(page,'customer', path=>path==='/stores/1'?{storeId:1,storeName:'QA',productCategories:[]}:path==='/cart'?{items:[],version:1}:path==='/favorites/stores/check/1'?false:path==='/products/store/1'?[{productId:1,nameAr:'New product',estimatedPriceMin:'10',estimatedPriceMax:'10',isPriceFixed:true}]:[]);
 await page.goto('/stores/1');
 await page.getByRole('button',{name:'كل المنتجات',exact:true}).click();
 await expect(page.getByRole('heading',{name:'New product'})).toBeVisible();
});

test('bank instructions load after order acceptance without a page reload',async({page})=>{
 let accepted=false;
 await session(page,'customer',()=>[]);
 await page.route('**/api/v1/orders/1', route=>route.fulfill({json:{success:true,data:{...order,status:accepted?'ACCEPTED':'PENDING',version:accepted?2:1,paymentMethod:'BANK_TRANSFER'}}}));
 await page.route('**/api/v1/orders/1/payment', route=>accepted?route.fulfill({json:{success:true,data:{status:'DUE',bankInstructions:'Bank instructions'}}}):route.fulfill({status:404,json:{success:false,message:'missing'}}));
 await page.goto('/orders/1');
 await expect(page.getByRole('heading',{name:'تفاصيل الطلب'})).toBeVisible();
 accepted=true;
 await page.getByRole('button',{name:'تحديث حالة الطلب',exact:true}).click();
 await expect(page.getByText('Bank instructions',{exact:true})).toBeVisible();
});

test('admin reconciles a late transfer then records refund',async({page})=>{
 let paymentStatus='VOID';
 await session(page,'admin', path=>path==='/orders/1'?{...order,status:'CANCELLED',finalTotal:'20',paymentMethod:'BANK_TRANSFER'}:{method:'BANK_TRANSFER',status:paymentStatus,amount:'20',currency:'ILS',receipt:{submittedAt:'2026-11-20'},entries:[]});
 await page.route('**/api/v1/orders/1/payment/bank-reconciliation',route=>{expect(route.request().postDataJSON()).toEqual({amount:20,currency:'ILS',reference:'bank-ref'});paymentStatus='REFUND_REQUIRED';return route.fulfill({json:{success:true,data:{status:paymentStatus}}});});
 await page.route('**/api/v1/orders/1/payment/refund',route=>{expect(route.request().postDataJSON()).toEqual({amount:20,currency:'ILS',reference:'refund-ref'});paymentStatus='REFUNDED';return route.fulfill({json:{success:true,data:{status:paymentStatus}}});});
 await page.goto('/orders/1');
 await page.getByLabel('المبلغ في كشف البنك').fill('20');await page.getByLabel('مرجع البنك').fill('bank-ref');
 await page.getByRole('button',{name:'تأكيد المطابقة مع كشف البنك'}).click();
 await page.getByLabel('المبلغ المسترد').fill('20');await page.getByLabel('مرجع الاسترداد').fill('refund-ref');
 await page.getByRole('button',{name:'تسجيل رد المبلغ بعد تنفيذه'}).click();
 await expect(page.getByText(/REFUNDED/)).toBeVisible();
});

test('checkout summary and submitted address follow the selection',async({page})=>{
 await session(page,'customer',path=>path==='/cart'?{items:[{productId:1,quantity:1}],version:1,storeId:1}:path==='/addresses'?[{id:1,label:'One',address:'First address'},{id:2,label:'Two',address:'Second address'}]:{});
 await page.route('**/api/v1/orders/updates', route => route.fulfill({ status: 503 }));
 await page.route('**/api/v1/orders/1', route => route.fulfill({ json: { success: true, data: order } }));
 await page.route('**/api/v1/orders',route=>{expect(route.request().postDataJSON().addressId).toBe(2);return route.fulfill({json:{success:true,data:order}});});
 await page.goto('/checkout');
 await page.getByLabel('اختر عنواناً محفوظاً').selectOption('2');
 await expect(page.locator('.checkout-address-card')).toContainText('Second address');
 await page.getByRole('button',{name:'تأكيد الطلب',exact:true}).click();
 await expect(page).toHaveURL(/orders\/1$/);
});

test('driver availability and admin approval display persisted false values',async({page})=>{
 await session(page,'driver',()=>({approved:true,available:false}));await page.goto('/operations');
 await expect(page.getByLabel('حالة التوفر')).toHaveValue('false');
 await session(page,'admin',()=>[{user_id:2,role:'driver',full_name:'Driver',driverProfile:{approved:false,available:false}}]);
 await page.goto('/operations?tab=users');await expect(page.getByRole('combobox',{name:/الاعتماد/})).toHaveValue('false');
});

test('checkout displays Bank of Palestine number and store owner can review forensic receipt and report fraud to admin', async ({ page }) => {
  await session(page, 'customer', path => {
    if (path === '/cart') return { items: [{ productId: 1, quantity: 2 }], version: 1, storeId: 5, estimatedMin: '40', products: [{ productId: 1, nameAr: 'وجبة شاورما', estimatedPriceMin: '20', isPriceFixed: true }] };
    if (path === '/addresses') return [{ id: 1, label: 'البيت', address: 'غزة - الرمال' }];
    if (path === '/stores/5') return { storeId: 5, storeNameAr: 'مطعم الشام', bankTransferPhone: '0592229436' };
    return {};
  });
  await page.goto('/checkout');
  await page.getByRole('radio', { name: /الدفع عبر بنك فلسطين/ }).check();
  await expect(page.getByText('0592229436')).toBeVisible();
  await expect(page.getByRole('button', { name: 'نسخ الرقم' })).toBeVisible();

  let reported = false;
  await session(page, 'store_owner', path => {
    if (path === '/orders/1') return { ...order, status: 'ACCEPTED', finalTotal: '40', paymentMethod: 'BANK_TRANSFER' };
    if (path === '/orders/1/payment') return {
      method: 'BANK_TRANSFER',
      status: 'DUE',
      amount: '40',
      currency: 'ILS',
      recipientPhone: '0597778899',
      storeCollected: true,
      receipt: {
        submittedAt: '2026-11-24T12:00:00Z',
        verificationStatus: 'FLAGGED_SUSPICIOUS',
        riskLevel: 'HIGH',
        riskScore: 80,
        reportReason: reported ? 'صورة الإيصال مزورة' : null,
        forensicReport: {
          riskScore: 80,
          riskLevel: 'HIGH',
          verdict: 'SUSPICIOUS',
          summaryAr: 'تم رصد برنامج تعديل صور وتكرار في الإيصال.',
          checks: [{ code: 'METADATA_TAMPER', labelAr: 'فحص آثار برامج التعديل', status: 'fail', detailAr: 'تم رصد Canva' }],
        },
      },
    };
    return {};
  });
  await page.route('**/api/v1/orders/1/payment/receipt/report', route => {
    expect(route.request().postDataJSON()).toEqual({ reason: 'صورة الإيصال مزورة' });
    reported = true;
    return route.fulfill({ json: { success: true, data: { reported: true } } });
  });
  await page.goto('/orders/1');
  await expect(page.getByLabel('نتائج الفحص التلقائي للإيصال')).toContainText('تم رصد Canva');
  await page.getByLabel('سبب الاشتباه').fill('صورة الإيصال مزورة');
  await page.getByRole('button', { name: 'إرسال بلاغ للأدمن' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد إرسال البلاغ' }).click();
  await expect(page.getByText('بلاغ اشتباه باحتيال من المتجر')).toBeVisible();
});

test('admin reviews fraud report queue and disables customer account', async ({ page }) => {
  let suspended = false;
  await session(page, 'admin', path => {
    if (path === '/finance/receipt-reports') {
      return {
        items: [{
          orderId: 99,
          submittedAt: '2026-11-24T12:00:00Z',
          verificationStatus: suspended ? 'FRAUD_CONFIRMED' : 'REPORTED_FRAUD',
          riskLevel: 'HIGH',
          riskScore: 85,
          reportReason: 'إيصال مفبرك لا يظهر في كشف بنك فلسطين',
          decision: suspended ? 'suspend' : null,
          payment: {
            amount: '55',
            currency: 'ILS',
            status: 'DUE',
            recipientPhone: '0592229436',
            storeCollected: false,
            order: {
              status: 'ACCEPTED',
              storeId: 3,
              storeName: 'Test Store',
              store: { storeNameAr: 'متجر غزة' },
              customer: { user_id: 77, full_name: 'عميل محتال', phone: '0591112233', is_active: !suspended },
            },
          },
        }],
        meta: { total: 1, page: 1, totalPages: 1 },
      };
    }
    return {};
  });
  await page.route('**/api/v1/orders/99/payment/receipt/review', route => {
    expect(route.request().postDataJSON()).toEqual({ decision: 'suspend', note: 'تطابق البلاغ مع كشف البنك' });
    suspended = true;
    return route.fulfill({ json: { success: true, data: { decision: 'suspend' } } });
  });
  await page.goto('/operations?tab=fraud');
  await expect(page.getByRole('heading', { name: 'بلاغات الاحتيال ومراجعة الإيصالات' })).toBeVisible();
  await expect(page.getByText('حساب العميل نشط')).toBeVisible();
  await page.getByLabel('القرار النهائي').selectOption('suspend');
  await page.getByLabel('ملاحظة المراجعة (اختياري)').fill('تطابق البلاغ مع كشف البنك');
  await page.getByRole('button', { name: 'اعتماد قرار المراجعة' }).click();
  await expect(page.getByText('حساب العميل معطّل')).toBeVisible();
});

test('checkout calculates distance delivery fee and highlights 2x Bank of Palestine points', async ({ page }) => {
  await session(page, 'customer', path => {
    if (path === '/cart') {
      return {
        items: [{ productId: 1, quantity: 2 }],
        version: 1,
        storeId: 5,
        estimatedMin: '40',
        estimatedMax: '40',
        store: {
          storeName: 'Sham',
          storeNameAr: 'مطعم الشام',
          latitude: 31.5,
          longitude: 34.45,
          deliveryRangeKm: 10,
          deliveryBaseFee: '4',
          deliveryPerKmFee: '1.5',
          freeDeliveryThreshold: '100',
        },
        products: [{ productId: 1, nameAr: 'وجبة شاورما', estimatedPriceMin: '20', isPriceFixed: true }],
      };
    }
    if (path === '/addresses') {
      return [{ id: 1, label: 'البيت', address: 'غزة - الرمال', latitude: 31.518, longitude: 34.45 }];
    }
    if (path === '/rewards') {
      return { balance: 20, pointsPerOrder: 10, bankTransferPointsPerOrder: 20, pointsRequired: 100, discountPercent: 5 };
    }
    if (path === '/stores/5') return { storeId: 5, storeNameAr: 'مطعم الشام', bankTransferPhone: '0592229436' };
    return {};
  });
  await page.goto('/checkout');
  await expect(page.getByText(/رسوم التوصيل \(2 كم\)/)).toBeVisible();
  await expect(page.locator('.bop-detail-row').filter({ hasText: 'رسوم التوصيل' })).toContainText('٧٫٠٠');
  await expect(page.locator('.bop-detail-row').filter({ hasText: 'الإجمالي التقديري شامل التوصيل' })).toContainText('٤٧٫٠٠');
  await expect(page.getByText('اكسب 20 نقطة ولاء (ضعف النقاط)')).toBeVisible();
  await expect(page.getByText(/أضف منتجات بقيمة .*٦٠٫٠٠.* إضافية للحصول على توصيل مجاني/)).toBeVisible();

  await page.goto('/account');
  await expect(page.getByText(/20 نقطة \(ضعف النقاط\) عند الدفع عبر بنك فلسطين/)).toBeVisible();
});

test('store owner configures delivery pricing and views financial summary, and admin manages business model tab', async ({ page }) => {
  const storePatch: Record<string, unknown>[] = [];
  await session(page, 'store_owner', path => {
    if (path === '/stores/my-stores') {
      return [{
        storeId: 1, storeName: 'Bakery', storeNameAr: 'مخبز غزة', status: 'ACTIVE', areaId: 1, categoryId: 1,
        fullAddressAr: 'غزة - الرمال', isOpenNow: true, avgRating: '4.8', estimatedPrepMin: 20, planTier: 'PRO',
        deliveryBaseFee: '5', deliveryPerKmFee: '1.5', freeDeliveryThreshold: '80',
        storeCategory: { nameAr: 'مخابز', defaultCommissionBps: 500 },
      }];
    }
    if (path === '/store-categories') return [{ categoryId: 1, nameAr: 'مخابز' }];
    if (path === '/delivery-companies/me/queue') return null;
    if (path === '/finance/merchant-summary') {
      return {
        totals: {
          totalOrders: 12, deliveredOrders: 10, bankTransferOrders: 7, cashOrders: 5,
          grossSales: '1250.00', netStoreEarnings: '1187.50', platformFees: '62.50',
          deliveryFeesTotal: '70.00', pendingStorePayout: '250.00', pendingDirectBankHandover: '0.00',
        },
        config: { defaultCommissionBps: 500, proCommissionDiscountBps: 150, bankTransferPointsPerOrder: 20, cashPointsPerOrder: 10 },
        stores: [{
          storeId: 1, storeName: 'Bakery', storeNameAr: 'مخبز غزة', status: 'ACTIVE', planTier: 'PRO', commissionBps: null,
          categoryNameAr: 'مخابز', effectiveCommissionBps: 350, deliveredOrders: 10, grossSales: '1250.00', netEarnings: '1187.50', platformFees: '62.50',
        }],
      };
    }
    return {};
  });
  await page.route('**/api/v1/stores/1', route => {
    storePatch.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, data: { storeId: 1 } } });
  });
  await page.goto('/operations');
  await expect(page.getByText('باقة PRO')).toBeVisible();
  const ownerCard = page.locator('.owner-store-card').first();
  await ownerCard.getByText('تعديل بيانات المتجر', { exact: true }).click();
  await ownerCard.getByLabel('رسوم التوصيل الأساسية (شيكل)').fill('6');
  await ownerCard.getByRole('button', { name: 'حفظ المتجر' }).click();
  await expect.poll(() => storePatch.length).toBe(1);
  expect(storePatch[0]).toMatchObject({ deliveryBaseFee: 6, deliveryPerKmFee: 1.5, freeDeliveryThreshold: 80 });

  await page.getByRole('navigation').getByRole('link', { name: 'الأرباح والعمولات' }).click();
  await expect(page.getByRole('heading', { name: 'ملخص الأرباح والعمولات' })).toBeVisible();
  await expect(page.getByText(/١٬١٨٧٫٥٠|1,?187\.50/).first()).toBeVisible();
  await expect(page.getByText(/العمولة المطبقة: 3\.50٪/)).toBeVisible();

  let catPct = 500;
  let storePlan: 'FREE' | 'PRO' = 'FREE';
  let storeCustomBps: number | null = null;
  let companyFee = '1.5';
  await session(page, 'admin', path => {
    if (path === '/finance/platform-summary') {
      return {
        config: {
          defaultCommissionBps: 500, proCommissionDiscountBps: 150,
          deliveryBaseFeeIls: '4', deliveryPerKmFeeIls: '1.5', deliveryPlatformCutBps: 1000, driverFeeIls: '0',
        },
        totals: {
          totalStores: 1, activeStores: 1, proStores: storePlan === 'PRO' ? 1 : 0, freeStores: storePlan === 'FREE' ? 1 : 0,
          deliveredOrders: 15, activeOrders: 2, bankTransferOrders: 10, cashOrders: 5, pendingSettlementOrders: 1,
          grossMerchandiseValue: '2400.00', totalDeliveryFees: '90.00', totalPlatformRevenue: '140.00',
          totalStorePayouts: '2170.00', totalDriverPayouts: '90.00', totalCompanyFees: '22.50',
        },
        categories: [{ categoryId: 1, nameAr: 'مطاعم', defaultCommissionBps: catPct, storeCount: 1 }],
        stores: [{
          storeId: 2, storeName: 'Sham', storeNameAr: 'مطعم الشام', status: 'ACTIVE', planTier: storePlan,
          commissionBps: storeCustomBps, categoryNameAr: 'مطاعم', categoryDefaultCommissionBps: catPct,
          effectiveCommissionBps: storeCustomBps ?? (storePlan === 'PRO' ? Math.max(0, catPct - 150) : catPct), totalOrders: 15,
        }],
      };
    }
    if (path === '/delivery-companies') return [{ id: 3, name: 'شركة البرق', managerId: 22, feePerOrder: companyFee }];
    return [];
  });
  await page.route('**/api/v1/store-categories/1', route => {
    catPct = route.request().postDataJSON().defaultCommissionBps;
    return route.fulfill({ json: { success: true, data: { categoryId: 1, defaultCommissionBps: catPct } } });
  });
  await page.route('**/api/v1/stores/2/monetization', route => {
    const body = route.request().postDataJSON();
    storePlan = body.planTier;
    storeCustomBps = body.commissionBps;
    return route.fulfill({ json: { success: true, data: { storeId: 2, planTier: storePlan, commissionBps: storeCustomBps } } });
  });
  await page.route('**/api/v1/delivery-companies/3', route => {
    companyFee = String(route.request().postDataJSON().feePerOrder);
    return route.fulfill({ json: { success: true, data: { id: 3, name: 'شركة البرق', feePerOrder: companyFee } } });
  });

  await page.goto('/operations?tab=business');
  await expect(page.getByRole('heading', { name: 'نموذج العمل والعمولات والأرباح' })).toBeVisible();
  await expect(page.getByText(/٢٬٤٠٠٫٠٠|2,?400\.00/)).toBeVisible();
  await page.getByLabel('النسبة (٪ - اتركه فارغاً للافتراضي)').fill('6.5');
  await page.getByRole('button', { name: 'حفظ عمولة التصنيف' }).click();
  await expect(page.getByText('6.50٪ (650 نقطة أساس)')).toBeVisible();

  await page.getByLabel('الباقة').selectOption('PRO');
  await page.getByLabel('عمولة مخصصة للمتجر (٪ - اختياري)').fill('4');
  await page.getByRole('button', { name: 'حفظ باقة المتجر' }).click();
  await expect(page.getByText('العمولة الفعلية: 4.00٪ (مخصصة للمتجر)')).toBeVisible();

  await page.getByText('إدارة شركات التوصيل', { exact: true }).click();
  await page.getByLabel('رسوم المنصة لكل طلب (شيكل)').fill('2.25');
  await page.getByRole('button', { name: 'تحديث رسوم الشركة' }).click();
  await expect(page.getByText(/رسوم الطلب: 2\.25 ₪/)).toBeVisible();
});

test('checkout prices option extraCost, applies server delivery quote, shows reward discount row, and surfaces 403/409 errors', async ({ page }) => {
  let submitCount = 0;
  let quoteCalls = 0;
  await session(page, 'customer', path => {
    if (path === '/cart') {
      return {
        items: [{ productId: 1, quantity: 2, optionIds: [10] }],
        version: 1,
        storeId: 5,
        estimatedMin: '46',
        estimatedMax: '46',
        store: {
          storeName: 'Sham',
          storeNameAr: 'مطعم الشام',
          latitude: 31.5,
          longitude: 34.45,
          deliveryRangeKm: 10,
          deliveryBaseFee: '4',
          deliveryPerKmFee: '1.5',
          freeDeliveryThreshold: '100',
        },
        products: [{
          productId: 1,
          nameAr: 'وجبة شاورما',
          estimatedPriceMin: '20',
          estimatedPriceMax: '20',
          isPriceFixed: true,
          productOptions: [{ optionId: 10, optionName: 'Extra Garlic', optionNameAr: 'ثومية إضافية', extraCost: '3', isAvailable: true }],
        }],
      };
    }
    if (path === '/addresses') {
      return [{ id: 1, label: 'البيت', address: 'غزة - الرمال', latitude: 31.518, longitude: 34.45 }];
    }
    if (path === '/orders/delivery-quote') {
      quoteCalls++;
      return {
        storeId: 5,
        addressId: 1,
        deliveryDistanceKm: '2.00',
        deliveryRangeKm: '10',
        withinRange: true,
        deliveryFee: '7.50',
        freeDeliveryApplied: false,
        freeDeliveryThreshold: '100',
      };
    }
    if (path === '/rewards') {
      return { balance: 100, pointsPerOrder: 10, bankTransferPointsPerOrder: 20, pointsRequired: 100, discountPercent: 5 };
    }
    if (path === '/stores/5') return { storeId: 5, storeNameAr: 'مطعم الشام', bankTransferPhone: '0592229436' };
    return {};
  });
  await page.route('**/api/v1/orders', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    submitCount++;
    if (submitCount === 1) {
      return route.fulfill({ status: 403, json: { success: false, message: 'غير مصرح بإتمام الطلب لهذا الحساب' } });
    }
    return route.fulfill({ status: 409, json: { success: false, message: 'تغيّرت بيانات السلة قبل إرسال الطلب' } });
  });

  await page.goto('/checkout');
  await expect.poll(() => quoteCalls).toBeGreaterThanOrEqual(1);
  const itemRow = page.locator('.checkout-items-list li').first();
  await expect(itemRow).toContainText('وجبة شاورما × 2 (ثومية إضافية)');
  await expect(itemRow).toContainText(/٤٦٫٠٠|46\.00/);
  await expect(page.locator('.bop-detail-row').filter({ hasText: 'رسوم التوصيل' })).toContainText(/٧٫٥٠|7\.50/);
  await expect(page.locator('.bop-detail-row').filter({ hasText: 'الإجمالي التقديري شامل التوصيل' })).toContainText(/٥٣٫٥٠|53\.50/);

  await page.getByRole('checkbox', { name: /استخدم 100 نقطة/ }).check();
  await expect(page.locator('.bop-detail-row').filter({ hasText: 'خصم المكافآت (5٪)' })).toContainText(/٢٫٣٠|2\.30/);
  await expect(page.locator('.bop-detail-row').filter({ hasText: 'الإجمالي التقديري شامل التوصيل' })).toContainText(/٥١٫٢٠|51\.20/);

  await page.getByRole('button', { name: 'تأكيد الطلب', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('غير مصرح بإتمام الطلب لهذا الحساب');

  await page.getByRole('button', { name: 'تأكيد الطلب', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('تغيّرت بيانات السلة قبل إرسال الطلب');
});

test('store owner clears store coordinates and manages product options CRUD', async ({ page }) => {
  const storePatches: Record<string, unknown>[] = [];
  let storeCoords: { latitude: number | null; longitude: number | null } = { latitude: 31.5, longitude: 34.45 };
  let options: Array<{ optionId: number; optionName: string; optionNameAr?: string | null; extraCost: string; isAvailable: boolean }> = [];

  await session(page, 'store_owner', path => {
    if (path === '/stores/my-stores') {
      return [{
        storeId: 1, storeName: 'Bakery', storeNameAr: 'مخبز غزة', status: 'ACTIVE', areaId: 1, categoryId: 1,
        fullAddressAr: 'غزة - الرمال', isOpenNow: true, avgRating: '4.8', estimatedPrepMin: 20,
        deliveryRangeKm: 10, ...storeCoords,
      }];
    }
    if (path === '/store-categories') return [{ categoryId: 1, nameAr: 'مخابز' }];
    if (path === '/delivery-companies/me/queue') return null;
    if (path === '/product-categories') return [{ prodCategoryId: 2, nameAr: 'المخبوزات' }];
    if (path === '/products/store/1') {
      return [{
        productId: 1, storeId: 1, nameAr: 'مناقيش زعتر', isAvailable: true, isPriceFixed: true,
        estimatedPriceMin: '10', estimatedPriceMax: '10', productOptions: options,
      }];
    }
    return {};
  });
  await page.route('**/api/v1/stores/1', route => {
    const body = route.request().postDataJSON();
    storePatches.push(body);
    storeCoords = { latitude: body.latitude ?? null, longitude: body.longitude ?? null };
    return route.fulfill({ json: { success: true, data: { storeId: 1, ...storeCoords } } });
  });
  await page.route('**/api/v1/products/1/options', route => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON();
    expect(body).toEqual({ optionName: 'Extra Cheese', optionNameAr: 'جبنة إضافية', extraCost: 3.5, isAvailable: true });
    const created = { optionId: 10, optionName: body.optionName, optionNameAr: body.optionNameAr, extraCost: String(body.extraCost), isAvailable: true };
    options = [created];
    return route.fulfill({ json: { success: true, data: created } });
  });
  await page.route('**/api/v1/products/1/options/10', route => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      options = options.map(opt => opt.optionId === 10 ? { ...opt, ...body, extraCost: String(body.extraCost ?? opt.extraCost) } : opt);
      return route.fulfill({ json: { success: true, data: options[0] } });
    }
    if (method === 'DELETE') {
      options = [];
      return route.fulfill({ json: { success: true, data: { message: 'Product option deleted successfully' } } });
    }
    return route.fallback();
  });

  await page.goto('/operations');
  const storeCard = page.locator('.owner-store-card').first();
  await storeCard.getByText('تعديل بيانات المتجر', { exact: true }).click();
  await storeCard.getByRole('button', { name: 'مسح إحداثيات الموقع' }).click();
  await storeCard.getByRole('button', { name: 'حفظ المتجر' }).click();
  await expect.poll(() => storePatches.length).toBe(1);
  expect(storePatches[0]).toMatchObject({ latitude: null, longitude: null });

  await storeCard.getByRole('button', { name: 'إدارة المنتجات' }).click();
  const productCard = page.locator('.product-card').first();
  await productCard.getByText(/خيارات المنتج \(0\)/).click();
  await productCard.getByLabel('اسم الخيار بالعربية (اختياري)').last().fill('جبنة إضافية');
  await productCard.getByLabel('اسم الخيار بالإنجليزية').last().fill('Extra Cheese');
  await productCard.getByLabel('التكلفة الإضافية (₪)').last().fill('3.5');
  await productCard.getByRole('button', { name: 'إضافة خيار للمنتج' }).click();
  await expect(productCard.getByText('تمت إضافة الخيار «جبنة إضافية».')).toBeVisible();
  await expect(productCard.getByText(/خيارات المنتج \(1\)/)).toBeVisible();

  await productCard.getByRole('button', { name: 'تعطيل الخيار' }).click();
  await expect(productCard.getByText('تم تحديث توفر الخيار «جبنة إضافية».')).toBeVisible();

  await productCard.getByText('تعديل الخيار', { exact: true }).click();
  await productCard.getByLabel('التكلفة الإضافية (₪)').first().fill('4');
  await productCard.getByRole('button', { name: 'حفظ تعديل الخيار' }).click();
  await expect(productCard.getByText('تم حفظ تعديل الخيار «جبنة إضافية».')).toBeVisible();

  await productCard.getByRole('button', { name: 'حذف' }).click();
  await expect(productCard.getByText('تم حذف الخيار «جبنة إضافية».')).toBeVisible();
  await expect(productCard.getByText(/خيارات المنتج \(0\)/)).toBeVisible();
});

test('admin filters users with localized roles, confirms disable dialog, and inspects unsettled orders list', async ({ page }) => {
  let customerActive = true;
  let disabledCalls = 0;
  await session(page, 'admin', path => {
    if (path === '/users') {
      return [
        { user_id: 2, role: 'customer', full_name: 'عميل نشط', phone: '0591112233', is_active: customerActive },
        { user_id: 3, role: 'driver', full_name: 'سائق تجريبي', phone: '0594445566', is_active: true, driverProfile: { approved: true, available: false } },
      ];
    }
    if (path === '/finance/platform-summary') {
      return {
        config: {
          defaultCommissionBps: 500, proCommissionDiscountBps: 150,
          deliveryBaseFeeIls: '4', deliveryPerKmFeeIls: '1.5', deliveryPlatformCutBps: 1000, driverFeeIls: '0',
          platformBankPhone: '0592229436',
        },
        totals: {
          totalStores: 1, activeStores: 1, proStores: 0, freeStores: 1,
          deliveredOrders: 1, activeOrders: 0, bankTransferOrders: 0, cashOrders: 1, pendingSettlementOrders: 1,
          grossMerchandiseValue: '120.00', totalDeliveryFees: '7.00', totalPlatformRevenue: '6.00',
          totalStorePayouts: '107.00', totalDriverPayouts: '7.00', totalCompanyFees: '0.00',
        },
        categories: [],
        stores: [],
        pendingSettlementOrdersList: [{
          orderId: 88, storeNameAr: 'مطعم الشام', amount: '120.00', method: 'CASH',
          needsHandover: true, needsStorePayout: true, needsDriverPayout: false,
        }],
      };
    }
    if (path === '/delivery-companies') return [];
    return [];
  });
  await page.route('**/api/v1/users/2', route => {
    if (route.request().method() === 'DELETE') {
      disabledCalls++;
      customerActive = false;
      return route.fulfill({ json: { success: true, data: { message: 'User disabled' } } });
    }
    return route.fallback();
  });

  await page.goto('/operations?tab=users');
  await expect(page.getByText(/عميل ·/)).toBeVisible();
  await expect(page.getByText(/سائق ·/)).toBeVisible();

  await page.getByLabel('تصفية حسب الدور').selectOption('customer');
  await expect(page.getByText('يعرض 1 من أصل 2 حساب في هذه الصفحة.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /سائق تجريبي/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'تعطيل الحساب' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('تأكيد تعطيل الحساب');
  await dialog.getByRole('button', { name: 'تأكيد التعطيل' }).click();
  await expect.poll(() => disabledCalls).toBe(1);
  await expect(page.getByText('تم تعطيل الحساب #2 وإلغاء جلساته')).toBeVisible();
  await expect(page.getByText('حساب معطّل')).toBeVisible();

  await page.goto('/operations?tab=business');
  await expect(page.getByRole('heading', { name: 'طلبات مُسلّمة بانتظار التسوية' })).toBeVisible();
  const settlementLink = page.getByRole('link', { name: /طلب #88 · مطعم الشام/ });
  await expect(settlementLink).toBeVisible();
  await expect(settlementLink).toHaveAttribute('href', '/orders/88');
  await expect(settlementLink).toContainText('بانتظار توريد النقد');
  await expect(settlementLink).toContainText('بانتظار صرف المتجر');
});
