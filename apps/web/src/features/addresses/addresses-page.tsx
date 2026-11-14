import { useState } from 'react';
import { api, json } from '../../shared/api/client';
import { getAddresses, type Address } from './address-api';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

export default function Addresses() {
  const state = useResource(signal => getAddresses(signal), 'addresses');
  const [editing, setEditing] = useState<Address>();
  const [saveCount, setSaveCount] = useState(0);
  return (
    <>
      <Title label="عناويني" />
      <div className="split">
        <Result state={state}>
          {items =>
            items.length ? (
              <div className="stack">
                {items.map(item => (
                  <div className="surface padded" key={item.id}>
                    <h2>{item.label}</h2>
                    <p>{item.address}</p>
                    <button
                      className="secondary"
                      onClick={() => setEditing(item)}
                    >
                      تعديل
                    </button>
                    <ActionForm
                      label="حذف العنوان"
                      submit={async () => {
                        await api(`/addresses/${item.id}`, {
                          method: 'DELETE',
                        });
                        if (editing?.id === item.id) setEditing(undefined);
                        state.reload();
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="لا توجد عناوين محفوظة" />
            )
          }
        </Result>
        <div className="surface padded">
          <h2>{editing ? 'تعديل العنوان' : 'إضافة عنوان'}</h2>
          <ActionForm
            key={`${editing?.id ?? 'new'}:${saveCount}`}
            label="حفظ العنوان"
            submit={async data => {
              const payload = {
                label: String(data.get('label')).trim(),
                address: String(data.get('address')).trim(),
                latitude: Number(data.get('latitude')),
                longitude: Number(data.get('longitude')),
              };
              await api(
                editing ? `/addresses/${editing.id}` : '/addresses',
                json(editing ? 'PUT' : 'POST', payload),
              );
              setEditing(undefined);
              setSaveCount(count => count + 1);
              state.reload();
            }}
          >
            <Field
              label="اسم العنوان"
              name="label"
              maxLength={80}
              defaultValue={editing?.label}
            />
            <Field
              label="العنوان بالتفصيل"
              name="address"
              maxLength={500}
              defaultValue={editing?.address}
            />
            <div className="split">
              <Field
                label="خط العرض"
                name="latitude"
                type="number"
                min={-90}
                max={90}
                step="0.00000001"
                defaultValue={editing?.latitude}
              />
              <Field
                label="خط الطول"
                name="longitude"
                type="number"
                min={-180}
                max={180}
                step="0.00000001"
                defaultValue={editing?.longitude}
              />
            </div>
          </ActionForm>
          {saveCount > 0 && !editing && <p role="status">تم حفظ العنوان.</p>}
          {editing && (
            <button className="secondary" onClick={() => setEditing(undefined)}>
              إلغاء التعديل
            </button>
          )}
        </div>
      </div>
    </>
  );
}
