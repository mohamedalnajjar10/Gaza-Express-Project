export const money = (value: string | number, currency = 'ILS') =>
  new Intl.NumberFormat('ar-PS', { style: 'currency', currency }).format(
    Number(value),
  );
