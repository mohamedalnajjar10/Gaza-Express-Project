// Run inside the API container belonging to the disposable Compose smoke stack.
const { randomBytes, randomInt } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const target = new URL(process.env.DATABASE_URL || 'mysql://invalid');
if (process.env.WASLA_BROWSER_SMOKE !== '1' || target.protocol !== 'mysql:' ||
    target.hostname !== 'mysql' || target.pathname !== '/wasla_smoke_test' || target.username !== 'gaza') {
  throw new Error('Browser smoke fixtures require the disposable Compose database');
}

const db = new PrismaClient();
const password = randomBytes(24).toString('hex');
const phoneBase = randomInt(1_000_000, 9_999_994);
const roles = ['customer', 'store_owner', 'driver'];

async function seed(project, firstPhone, password_hash) {
  const [customer, owner, driver] = await db.$transaction(roles.map((role, index) =>
    db.user.create({ data: {
      role, phone: `059${firstPhone + index}`, full_name: `QA ${role}`,
      password_hash, is_verified: true, addressPromptedAt: new Date(),
    } }),
  ));
  await db.driverProfile.create({ data: {
    userId: driver.user_id, approved: true, available: true, dispatchAreaId: 1,
  } });
  const address = await db.deliveryAddress.create({ data: {
    customerId: customer.user_id, label: 'منزل الاختبار', address: 'عنوان التوصيل التجريبي',
    area: 'غزة', latitude: 31.5, longitude: 34.45, phone: '+970590000001',
  } });
  await db.user.update({ where: { user_id: customer.user_id }, data: { defaultAddressId: address.id } });
  const category = await db.storeCategory.create({ data: { nameAr: `فئة الاختبار ${project}` } });
  const store = await db.store.create({ data: {
    storeName: `Smoke Shop ${project}`, storeNameAr: `متجر الاختبار ${firstPhone}`,
    ownerId: owner.user_id, categoryId: category.categoryId, areaId: 1,
    latitude: 31.5, longitude: 34.45, status: 'ACTIVE',
  } });
  const product = await db.product.create({ data: {
    storeId: store.storeId, nameAr: 'خبز تجريبي', isPriceFixed: true, estimatedPriceMin: 12, estimatedPriceMax: 12,
  } });
  await db.productFavorite.create({ data: { userId: customer.user_id, productId: product.productId } });
  await db.product.createMany({ data: Array.from({ length: 25 }, (_, index) => ({
    storeId: store.storeId, nameAr: `منتج محفوظ ${index + 1}`, sortOrder: index + 1,
  })) });
  const moreProducts = await db.product.findMany({
    where: { storeId: store.storeId, productId: { not: product.productId } },
    select: { productId: true },
  });
  await db.productFavorite.createMany({ data: moreProducts.map(({ productId }) => ({ userId: customer.user_id, productId })) });
  return {
    password, customer: customer.phone, owner: owner.phone, driver: driver.phone,
    storeId: store.storeId, storeName: store.storeNameAr, productId: product.productId,
  };
}

async function main() {
  const hash = await bcrypt.hash(password, 10);
  const desktop = await seed('desktop', phoneBase, hash);
  const mobile = await seed('mobile', phoneBase + roles.length, hash);
  process.stdout.write(JSON.stringify({ desktop, mobile }));
}

main().catch(error => {
  console.error('Browser smoke fixture setup failed', error.code || error.name);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
