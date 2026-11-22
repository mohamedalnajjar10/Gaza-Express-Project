import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeCategories = ['مطاعم', 'سوبر ماركت', 'مول', 'مخبز', 'محل جوالات'];
  for (const [sortOrder, nameAr] of storeCategories.entries()) {
    await prisma.storeCategory.upsert({
      where: { nameAr },
      create: { nameAr, sortOrder },
      update: { isActive: true },
    });
  }

  const store1 = await prisma.store.findFirst();
  if (!store1) {
    console.log('No stores found. Skipping product category seeding.');
    return;
  }

  const categories = [
    { storeId: store1.storeId, nameAr: 'ألبان', nameEn: 'Dairy', sortOrder: 1 },
    { storeId: store1.storeId, nameAr: 'خضروات', nameEn: 'Vegetables', sortOrder: 2 },
    { storeId: store1.storeId, nameAr: 'فواكه', nameEn: 'Fruits', sortOrder: 3 },
    { storeId: store1.storeId, nameAr: 'لحوم', nameEn: 'Meat', sortOrder: 4 },
    { storeId: store1.storeId, nameAr: 'مشروبات', nameEn: 'Beverages', sortOrder: 5 },
    { storeId: store1.storeId, nameAr: 'مخبوزات', nameEn: 'Bakery', sortOrder: 6 },
  ];

  const count = await prisma.$transaction(async tx => {
    const existing = await tx.productCategory.findMany({
      where: { storeId: store1.storeId },
      select: { prodCategoryId: true, nameAr: true, nameEn: true, sortOrder: true, parentId: true },
    });
    if (existing.length === 0) return (await tx.productCategory.createMany({ data: categories })).count;

    let repaired = 0;
    for (const previous of existing.filter(category => category.parentId === null && /^[?\uFFFD\s]+$/.test(category.nameAr))) {
      const fixture = categories.find(category => category.nameEn === previous.nameEn && category.sortOrder === previous.sortOrder);
      if (!fixture) continue;
      const result = await tx.productCategory.updateMany({
        where: { prodCategoryId: previous.prodCategoryId, nameAr: previous.nameAr },
        data: { nameAr: fixture.nameAr },
      });
      repaired += result.count;
    }
    return repaired;
  });

  console.log(`Wrote ${count} fixture product categories for store ${store1.storeId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
