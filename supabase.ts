
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';
const MINHA_CHAVE_MANUAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkaXN0b2l1cXRlZ25ubXNsdGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAzNjIsImV4cCI6MjA4MzU2NjM2Mn0.aeLAzOlJZqcnC5fIvuAvUmBPXMLKGOTUyuYgKLqGRfA'; 

const supabaseKey = process.env.VITE_SUPABASE_KEY || (window as any).VITE_SUPABASE_KEY || MINHA_CHAVE_MANUAL;

export const supabase = createClient(supabaseUrl, supabaseKey);

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const extractCoords = (store: any) => {
  // Prioridade 1: Campos numéricos explícitos (mais confiável)
  if (store.lat && store.lng) return { lat: Number(store.lat), lng: Number(store.lng) };
  if (store.latitude && store.longitude) return { lat: Number(store.latitude), lng: Number(store.longitude) };
  
  const loc = store.location;
  if (!loc) return null;

  if (typeof loc === 'string') {
    // Caso POINT(LNG LAT) - Padrão PostGIS WKT
    if (loc.includes('POINT')) {
      const matches = loc.match(/POINT\s?\(([-\d\.]+)\s+([-\d\.]+)\)/);
      if (matches) return { lng: parseFloat(matches[1]), lat: parseFloat(matches[2]) };
    }
    // Caso Hexadecimal PostGIS EWKB
    if (/^[0-9a-fA-F]+$/.test(loc) && loc.length > 30) {
       // Se o dado estiver em Hex, retornamos a posição fixa do banco para o MVP
       // ou o ideal é o lojista ter lat/lng salvos em colunas separadas.
       return { lat: -23.5505, lng: -46.6333 };
    }
  }

  return null;
};

export const getProducts = async (radiusKm: number, userLat: number, userLng: number, term?: string, materialIds?: number[]) => {
  const effectiveRadius = Number(radiusKm);
  const searchTerm = term?.trim() || '';
  
  try {
    const { data: allStores, error: sError } = await supabase.from('stores').select('*');
    if (sError || !allStores) return [];

    const storeDistanceMap: Record<string, number> = {};
    const storeDataMap: Record<string, any> = {};
    const nearbyStoreIds: string[] = [];

    allStores.forEach((store: any) => {
      const coords = extractCoords(store);
      if (coords) {
        const dist = calculateDistance(userLat, userLng, coords.lat, coords.lng);
        storeDistanceMap[store.id] = dist;
        // FILTRO RÍGIDO: Só entra se estiver dentro do raio
        if (dist <= effectiveRadius) {
          nearbyStoreIds.push(store.id);
        }
      } else {
        storeDistanceMap[store.id] = 9999;
      }
      storeDataMap[store.id] = store;
    });

    // Se nenhuma loja estiver no raio selecionado, retornamos vazio para respeitar a vontade do usuário
    if (nearbyStoreIds.length === 0) return [];

    let query = supabase.from('products').select('*').in('store_id', nearbyStoreIds);

    if (materialIds && materialIds.length > 0) {
      query = query.in('material_id', materialIds);
    } else if (searchTerm) {
      query = query.ilike('name', `%${searchTerm}%`);
    }

    const { data: products, error: pError } = await query.limit(100);
    if (pError || !products) return [];

    return products
      .map(p => {
        const store = storeDataMap[p.store_id];
        return {
          ...p,
          store_name: store?.name || 'Loja',
          whatsapp: store?.whatsapp || '',
          address: store?.address || '',
          distance_km: storeDistanceMap[p.store_id] || 0
        };
      })
      .filter(p => p.active !== false)
      .sort((a, b) => a.distance_km - b.distance_km);

  } catch (err) {
    console.error("Erro getProducts:", err);
    return [];
  }
};
