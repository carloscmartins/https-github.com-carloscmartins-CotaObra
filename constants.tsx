
import { Product, Store } from './types';

const today = new Date().toISOString();

export const MOCK_STORES: Store[] = [
  {
    id: 's1',
    name: 'ConstruMais Bairro',
    address: 'Av. Principal, 1000 - Centro',
    whatsapp: '5511999999999',
    rating: 4.8,
    deliveryRadius: 10,
    location: { lat: -23.55052, lng: -46.633308 }
  },
  {
    id: 's2',
    name: 'Depósito São José',
    address: 'Rua das Flores, 50 - Vila Nova',
    whatsapp: '5511888888888',
    rating: 4.5,
    deliveryRadius: 5,
    location: { lat: -23.5615, lng: -46.6559 }
  }
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Cimento CP-II Votoran 50kg',
    description: 'Cimento de alta qualidade para obras estruturais.',
    category: 'Cimento',
    price: 32.90,
    storeId: 's1',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
    updatedAt: today,
    active: true
  },
  {
    id: 'p2',
    name: 'Tubo de PVC Tigre 100mm 6m',
    description: 'Tubo para esgoto predial reforçado.',
    category: 'Hidráulica',
    price: 89.90,
    priceMax: 105.00,
    storeId: 's1',
    imageUrl: 'https://plus.unsplash.com/premium_photo-1661962363024-934f8611736b?q=80&w=800&auto=format&fit=crop',
    updatedAt: today,
    active: true,
    metadata: { material: 'PVC', brand: 'Tigre' }
  }
];
