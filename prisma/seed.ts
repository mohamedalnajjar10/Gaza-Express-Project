import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const store1 = await prisma.store.findFirst();
  if (!store1) {
    console.log('No stores found. Skipping product category seeding.');
    return;
  }

  const existing = await prisma.productCategory.findFirst({ where: { storeId: store1.storeId } });
  if (existing) {
    console.log('Product categories already exist for store', store1.storeId);
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

  for (const cat of categories) {
    await prisma.productCategory.create({ data: cat });
  }

  console.log(`Seeded ${categories.length} product categories for store ${store1.storeId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
