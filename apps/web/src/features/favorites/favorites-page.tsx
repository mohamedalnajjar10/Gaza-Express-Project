import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

export default function Favorites() {
  const [kind, setKind] = useState<'stores' | 'products'>('stores');
  const state = useResource(
    signal =>
      api<
        {
          storeId?: number;
          productId?: number;
          store?: { storeName: string; storeNameAr?: string };
          product?: { nameAr: string; storeId: number };
        }[]
      >(`/favorites/${kind}`, { signal }),
    kind,
  );
  return (
    <>
      <Title label="المفضّلة" />
      <div className="chips">
        {(['stores', 'products'] as const).map(k => (
          <button
            key={k}
            className={`chip ${kind === k ? 'selected' : ''}`}
            onClick={() => setKind(k)}
          >
            {k === 'stores' ? 'المتاجر' : 'المنتجات'}
          </button>
        ))}
      </div>
      <Result state={state}>
        {rows =>
          rows.length ? (
            <div className="stack">
              {rows.map(row => (
                <div
                  className="surface padded"
                  key={row.storeId ?? row.productId}
                >
                  <Link to={`/stores/${row.storeId ?? row.product?.storeId}`}>
                    {row.store?.storeNameAr ||
                      row.store?.storeName ||
                      row.product?.nameAr}
                  </Link>
                  <ActionForm
                    label="إزالة من المفضّلة"
                    submit={async () => {
                      await api(
                        `/favorites/${kind}/${row.storeId ?? row.productId}`,
                        { method: 'DELETE' },
                      );
                      state.reload();
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Empty title="لا توجد عناصر محفوظة" />
          )
        }
      </Result>
    </>
  );
}
