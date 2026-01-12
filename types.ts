
export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MasterMaterial {
  id: number;
  nome: string;
  descricao: string;
  categoria: string;
  unidade: string;
  sku?: string;
  ncm?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  priceMax?: number;
  imageUrl?: string;
  storeId: string;
  material_id?: number;
  metadata?: Record<string, any>;
  distance?: number;
  updatedAt?: string;
  active: boolean;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  whatsapp: string;
  rating: number;
  deliveryRadius: number;
  location: GeoPoint;
  settings?: {
    openingHours: string;
    acceptsCreditCard: boolean;
    minimumOrder?: number;
  };
}

export enum UserRole {
  CONSTRUCTOR = 'constructor',
  MERCHANT = 'merchant'
}
