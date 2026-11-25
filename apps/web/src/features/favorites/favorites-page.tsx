import { StoreTile } from '../catalog/store-tile';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm } from '../../shared/ui/form';
import { Pager } from '../../shared/ui/pager';
import { useResource } from '../../shared/hooks/use-resource';

type FavoriteKind = 'stores' | 'products';
type Favorite = {
  storeId?: number;
  productId?: number;
  store?: { storeName: string; storeNameAr?: string; logoUrl?: string; coverImageUrl?: string };
  product?: { nameAr: string; storeId: number };
};

const pageSize = 25;
const lastSupportedPage = 200;

export default function Favorites() {
  const [kind, setKind] = useState<FavoriteKind>('stores');
  return (
    <>
      <Title label="المفضّلة" />
      <div className="chips">
        {(['stores', 'products'] as const).map(k => (
          <button
            key={k}
            className={`chip ${kind === k ? 'selected' : ''}`}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            {k === 'stores' ? 'المتاجر' : 'المنتجات'}
          </button>
        ))}
      </div>
      <FavoriteList key={kind} kind={kind} />
    </>
  );
}

function FavoriteList({ kind }: { kind: FavoriteKind }) {
  const [page, setPage] = useState(1);
  const state = useResource(async signal => {
    const rows = await api<Favorite[]>(
      `/favorites/${kind}?page=${page}&limit=${pageSize}&lookahead=1`, { signal },
    );
    return { rows: rows.slice(0, pageSize), more: page < lastSupportedPage && rows.length > pageSize };
  }, `${kind}:${page}`);

  return (
    <Result state={state}>
      {({ rows, more }) => (
        <>
          {rows.length ? (
            <div className={kind === 'stores' ? 'store-tiles' : 'stack'}>
              {rows.map(row => (
                <div
                  className={kind === 'stores' ? 'favorite-store-tile' : 'surface padded'}
                  key={row.storeId ?? row.productId}
                >
                  {row.store && row.storeId ? <StoreTile id={row.storeId} name={row.store.storeNameAr || row.store.storeName} logo={row.store.logoUrl} cover={row.store.coverImageUrl} /> : <Link to={`/stores/${row.storeId ?? row.product?.storeId}`}>
                    {row.store?.storeNameAr ||
                      row.store?.storeName ||
                      row.product?.nameAr}
                  </Link>}
                  <ActionForm
                    label="إزالة من المفضّلة"
                    submit={async () => {
                      await api(
                        `/favorites/${kind}/${row.storeId ?? row.productId}`,
                        { method: 'DELETE' },
                      );
                      if (rows.length === 1 && page > 1) {
                        setPage(current => current === page ? page - 1 : current);
                      }
                      state.reload();
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Empty title="لا توجد عناصر محفوظة" />
          )}
          {(page > 1 || rows.length > 0) && <Pager page={page} more={more} setPage={setPage} />}
        </>
      )}
    </Result>
  );
}
