import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { user: { user_id: number; role: UserRole } };
