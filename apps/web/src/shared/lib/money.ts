export const money = (value: string | number, currency = 'ILS') => {
  const numeric = Number(value);
  return new Intl.NumberFormat('ar-PS', { style: 'currency', currency }).format(
    Number.isFinite(numeric) ? numeric : 0,
  );
};
