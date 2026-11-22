import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const before = (days: number) => new Date(Date.now() - days * 86_400_000);

async function prune() {
  for (let batch = 0; batch < 20; batch++) {
    const counts = await db.$transaction([
      db.$executeRaw`DELETE FROM refresh_tokens WHERE expires_at < ${before(30)} ORDER BY expires_at LIMIT 500`,
      db.$executeRaw`DELETE FROM sms_jobs WHERE status IN ('DELIVERED','EXPIRED','FAILED') AND updatedAt < ${before(30)} LIMIT 500`,
      db.$executeRaw`DELETE FROM otp_codes WHERE expires_at < ${before(7)} ORDER BY expires_at LIMIT 500`,
      db.$executeRaw`DELETE FROM notifications WHERE createdAt < ${before(180)} AND readAt IS NOT NULL ORDER BY createdAt LIMIT 500`,
    ]);
    console.log(JSON.stringify({ event: 'retention_batch', batch, counts }));
    if (counts.every(count => count < 500)) break;
  }
}

void prune().catch(() => {
  console.error('Retention job failed');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
