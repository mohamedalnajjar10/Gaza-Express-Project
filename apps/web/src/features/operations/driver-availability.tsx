import { useState } from 'react';
import { api, json } from '../../shared/api/client';
import { ActionForm } from '../../shared/ui/form';

export default function Availability() {
  const [saved, setSaved] = useState<boolean>();
  return (
    <section className="surface padded narrow">
      <h2>التوفر للتوصيل</h2>
      <ActionForm
        label="حفظ التوفر"
        submit={async fields => {
          const data = await api<{ available: boolean }>(
            '/drivers/me/availability',
            json('PATCH', { available: fields.get('available') === 'true' }),
          );
          setSaved(data.available);
        }}
      >
        <label>
          حالة التوفر
          <select name="available">
            <option value="true">متاح</option>
            <option value="false">غير متاح</option>
          </select>
        </label>
      </ActionForm>
      {saved !== undefined && (
        <p role="status">
          {saved ? 'أنت متاح للتوصيل' : 'أنت غير متاح للتوصيل'}
        </p>
      )}
    </section>
  );
}
