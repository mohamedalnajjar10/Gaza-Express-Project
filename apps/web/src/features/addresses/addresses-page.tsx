import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, MapPin, Pencil } from 'lucide-react';
import { api } from '../../shared/api/client';
import { useIdentity } from '../../shared/auth/identity';
import { ActionForm } from '../../shared/ui/form';
import { Result } from '../../shared/ui/feedback';
import { useResource } from '../../shared/hooks/use-resource';
import { getAddresses, type Address } from './address-api';
import { AddressEditor } from './address-editor';

export default function Addresses() {
  const { profile, refreshProfile } = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useResource(signal => getAddresses(signal), `addresses:${profile?.user_id}`);
  const [editing, setEditing] = useState<Address>();
  const [saved, setSaved] = useState(false);
  const onboarding = location.state?.onboarding === true && profile?.addressPromptedAt === null;
  const destination = typeof location.state?.from === 'string' && /^\/(?!\/)/.test(location.state.from) && !location.state.from.startsWith('/addresses')
    ? location.state.from : profile?.role === 'customer' ? '/' : '/operations';
  const continueToApp = () => navigate(destination, { replace: true, state: location.state?.fromState });

  async function finished() {
    await refreshProfile();
    if (onboarding || location.state?.from === '/checkout') { continueToApp(); return; }
    setEditing(undefined);
    setSaved(true);
    state.reload();
  }

  return (
    <div className="address-page">
      {onboarding && <div className="address-welcome"><span>لنصل إليك بسهولة</span><p>أضف عنوانك مرة واحدة لتكون طلباتك القادمة أسرع.</p>
        <ActionForm label="تخطي الآن" submit={async () => {
          await api('/addresses/onboarding', { method: 'PATCH' });
          await refreshProfile();
          continueToApp();
        }} />
      </div>}
      <Result state={state}>{items => {
        const primary = items.find(item => item.id === profile?.defaultAddressId) ?? items[0];
        if (editing || !primary) return <AddressEditor key={editing?.id ?? 'new'} address={editing} onSaved={finished} onCancel={editing ? () => setEditing(undefined) : undefined} />;
        return <section className="address-saved">
          <div className="address-saved-icon"><MapPin size={28} /></div>
          <span className="address-eyebrow">عنوانك المحفوظ</span>
          <h1>{primary.label}</h1>
          <p>{primary.address}</p>
          {primary.directions && <p>{primary.directions}</p>}
          {primary.phone && <span dir="ltr">{primary.phone}</span>}
          <button type="button" onClick={() => setEditing(primary)}><Pencil size={17} />تعديل العنوان</button>
          {saved && <p className="address-saved-notice" role="status"><Check size={17} />تم حفظ العنوان.</p>}
          {items.length > 1 && <details className="address-previous"><summary>العناوين المحفوظة سابقاً</summary>
            {items.filter(item => item.id !== primary.id).map(item => <button className="secondary" type="button" key={item.id} onClick={() => setEditing(item)}>{item.label} — {item.address}</button>)}
          </details>}
        </section>;
      }}</Result>
    </div>
  );
}

