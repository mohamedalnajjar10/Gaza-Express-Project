import type { OrderStatus, UserRole } from '@prisma/client';
import type { OrderAction } from './orders.dto';

export const transitions: Record<OrderAction, { roles: UserRole[]; from: OrderStatus[]; to: OrderStatus }> = {
  accept: { roles: ['store_owner'], from: ['PENDING'], to: 'ACCEPTED' },
  quote: { roles: ['store_owner'], from: ['PENDING', 'QUOTED'], to: 'QUOTED' },
  approve_quote: { roles: ['customer'], from: ['QUOTED'], to: 'ACCEPTED' },
  reject: { roles: ['store_owner'], from: ['PENDING', 'QUOTED'], to: 'REJECTED' },
  cancel: { roles: ['customer', 'store_owner', 'admin'], from: ['PENDING', 'QUOTED', 'ACCEPTED', 'READY', 'ASSIGNED'], to: 'CANCELLED' },
  confirm_return: { roles: ['admin'], from: ['IN_TRANSIT'], to: 'CANCELLED' },
  ready: { roles: ['store_owner'], from: ['ACCEPTED'], to: 'READY' },
  assign: { roles: ['admin'], from: ['READY'], to: 'READY' },
  accept_assignment: { roles: ['driver'], from: ['READY'], to: 'ASSIGNED' },
  decline_assignment: { roles: ['driver'], from: ['READY'], to: 'READY' },
  claim_delivery: { roles: ['driver'], from: ['ACCEPTED', 'READY'], to: 'ASSIGNED' },
  company_assign: { roles: ['store_owner'], from: ['ACCEPTED', 'READY'], to: 'ASSIGNED' },
  reroute_delivery: { roles: ['admin'], from: ['ACCEPTED', 'READY'], to: 'READY' },
  pick_up: { roles: ['driver'], from: ['ASSIGNED'], to: 'IN_TRANSIT' },
  deliver: { roles: ['driver'], from: ['IN_TRANSIT'], to: 'DELIVERED' },
  report_delivery_issue: { roles: ['driver'], from: ['IN_TRANSIT'], to: 'IN_TRANSIT' },
  reset_delivery_code: { roles: ['admin'], from: ['IN_TRANSIT'], to: 'IN_TRANSIT' },
};
