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
test('verification can create a driver account and opens operations without address onboarding', async ({ page }) => {
  await session(page, 'driver', path => {
    if (path === '/drivers/me/availability') return { approved: false, available: false };
    return [];
  });
  await page.route('**/api/v1/auth/verify-otp', route => {
    expect(route.request().postDataJSON()).toMatchObject({ role: 'driver', phone: '0591234567' });
    return route.fulfill({ json: { success: true, data: { tokens: { access_token: 'fixture', refresh_token: 'fixture' } } } });
  });
  await page.route('**/api/v1/auth/profile', route => route.fulfill({ json: {
    success: true, data: { user_id: 1, role: 'driver', full_name: 'سائق', addressPromptedAt: null },
  } }));
  await page.goto('/verify');
  await page.getByLabel('الاسم الكامل').fill('سائق الاختبار');
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0591234567');
  await page.getByLabel('رمز التحقق').fill('123456');
  await page.getByLabel('نوع الحساب').selectOption('driver');
  await page.getByLabel('كلمة المرور').fill('TestPassword123!');
  const submit = page.getByRole('button', { name: 'تحقّق من الرقم' });
  await expect(submit).toHaveAttribute('type', 'submit');
  await submit.click();
  await expect(page).toHaveURL(/\/operations$/);
  await expect(page.getByText('بانتظار اعتماد حساب السائق من الإدارة.')).toBeVisible();
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
 await session(page,'admin', path=>path==='/orders/1'?{...order,status:'CANCELLED',finalTotal:'20',paymentMethod:'BANK_TRANSFER'}:{method:'BANK_TRANSFER',status:paymentStatus,amount:'20',currency:'ILS',whatsappReceivedAt:'2026-11-20',entries:[]});
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
