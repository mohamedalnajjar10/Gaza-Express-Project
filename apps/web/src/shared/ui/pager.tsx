export function Pager({
  page,
  more,
  setPage,
}: {
  page: number;
  more: boolean;
  setPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <button
        className="secondary"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        السابق
      </button>
      <span>{page}</span>
      <button
        className="secondary"
        disabled={!more}
        onClick={() => setPage(page + 1)}
      >
        التالي
      </button>
    </div>
  );
}
