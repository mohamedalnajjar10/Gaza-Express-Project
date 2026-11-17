import { Gift } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { useResource } from '../../shared/hooks/use-resource';
import { Result } from '../../shared/ui/feedback';

type Rewards = { balance: number; pointsPerOrder: number; pointsRequired: number; discountPercent: number };
export function useRewards(active = true) {
  return useResource(signal => active ? api<Rewards>('/rewards', { signal }) : Promise.resolve(null), `rewards:${active}`);
}

export function RewardsLink() {
  return (
    <Link className="rewards-shortcut" to="/account#account-rewards">
      <span><Gift size={15} aria-hidden="true" /></span>
      المكافآت
    </Link>
  );
}

export function RewardsCard() {
  const state = useRewards();
  const { hash } = useLocation();
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash !== '#account-rewards') return;
    const frame = requestAnimationFrame(() => section.current?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [hash]);
  return (
    <section ref={section} className="surface padded rewards-card" id="account-rewards">
      <div className="rewards-heading"><Gift aria-hidden="true" /><h2>مكافآت غزة إكسبرس</h2></div>
      <Result state={state}>{reward => reward && <>
        <strong>{reward.balance} نقطة</strong>
        <progress aria-label="التقدم نحو الخصم" value={Math.min(reward.balance, reward.pointsRequired)} max={reward.pointsRequired} />
        <p>{reward.balance >= reward.pointsRequired ? `خصم ${reward.discountPercent}٪ جاهز للاستخدام عند تأكيد طلبك.` : `تبقّى ${reward.pointsRequired - reward.balance} نقطة للحصول على خصم ${reward.discountPercent}٪.`}</p>
        <small>{reward.pointsPerOrder} نقاط لكل طلب مُسلّم.</small>
      </>}</Result>
    </section>
  );
}
