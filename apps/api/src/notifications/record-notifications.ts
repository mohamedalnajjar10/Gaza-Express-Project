import { Prisma } from '@prisma/client';

export async function recordNotifications(tx: Prisma.TransactionClient, recipients: Array<number | null | undefined>, eventKey: string, kind: string, orderId: number, actorId?: number) {
  const userIds = [...new Set(recipients.filter((id): id is number => !!id && id !== actorId))];
  if (!userIds.length) return;
  await tx.notification.createMany({
    data: userIds.map(userId => ({ userId, eventKey, kind, orderId })),
    skipDuplicates: true,
  });
}
