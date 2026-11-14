export type Store = {
  storeId: number;
  storeName: string;
  storeNameAr?: string;
  descriptionAr?: string;
  coverImageUrl?: string;
  logoUrl?: string;
  isOpenNow: boolean;
  avgRating: string;
  estimatedPrepMin: number;
  storeCategory?: { nameAr: string };
};
export type Option = {
  optionId: number;
  optionName: string;
  optionNameAr?: string;
  extraCost: string;
  isAvailable: boolean;
};
export type Product = {
  productId: number;
  storeId: number;
  nameAr: string;
  descriptionAr?: string;
  imageUrl?: string;
  productCategory?: { nameAr: string };
  unitAr?: string;
  priceNoteAr?: string;
  estimatedPriceMin: string;
  estimatedPriceMax: string;
  isPriceFixed: boolean;
  productOptions?: Option[];
};
