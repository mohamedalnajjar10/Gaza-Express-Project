import { Gift } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Result } from '../../shared/ui/feedback';
import { RewardsLink, useRewards } from '../../shared/ui/rewards';

export { RewardsLink, useRewards };

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
        <small>
          {reward.pointsPerOrder} نقاط لكل طلب عند الاستلام · و{reward.bankTransferPointsPerOrder ?? reward.pointsPerOrder * 2} نقطة (ضعف النقاط) عند الدفع عبر بنك فلسطين.
        </small>
      </>}</Result>
    </section>
  );
}
