import { Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useResource } from '../hooks/use-resource';

export type Rewards = {
  balance: number;
  pointsPerOrder: number;
  bankTransferPointsPerOrder?: number;
  pointsRequired: number;
  discountPercent: number;
};

export function useRewards(active = true) {
  return useResource(
    signal => (active ? api<Rewards>('/rewards', { signal }) : Promise.resolve(null)),
    `rewards:${active}`,
  );
}

export function RewardsLink() {
  return (
    <Link className="rewards-shortcut" to="/account#account-rewards">
      <span><Gift size={15} aria-hidden="true" /></span>
      المكافآت
    </Link>
  );
}
