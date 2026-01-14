
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';
const MINHA_CHAVE_MANUAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkaXN0b2l1cXRlZ25ubXNsdGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAzNjIsImV4cCI6MjA4MzU2NjM2Mn0.aeLAzOlJZqcnC5fIvuAvUmBPXMLKGOTUyuYgKLqGRfA'; 

const supabaseKey = process.env.VITE_SUPABASE_KEY || (window as any).VITE_SUPABASE_KEY || MINHA_CHAVE_MANUAL;

export const supabase = createClient(supabaseUrl, supabaseKey);

function parseLocation(loc: any): { lat: number; lng: number } | null {
  if (!loc) return null;
  
  if (typeof loc === 'object' && loc.lat && loc.lng) {
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  }

  const locStr = String(loc);

  if (locStr.includes('POINT')) {
    try {
      const matches = locStr.match(/\(([^)]+)\)/);
      if (matches && matches[1]) {
        const parts = matches[1].trim().split(/\s+/);
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      }
    } catch (e) {
      console.warn("Falha ao ler WKT:", e);
    }
  }

  if (locStr.length >= 42) { 
    try {
      const readDouble = (hexPart: string) => {
        const bytes = new Uint8Array(hexPart.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const view = new DataView(bytes.buffer);
        return view.getFloat64(0, true);
      };
      
      const lng = readDouble(locStr.slice(-32, -16));
      const lat = readDouble(locStr.slice(-16));
      
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    } catch (e) { }
  }
  
  return null;
}

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number | null => {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;
  if (nLat1 === 0 || nLat2 === 0) return null;

  const R = 6371; 
  const dLat = (nLat2 - nLat1) * Math.PI / 180;
  const dLon = (nLon2 - nLon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(nLat1 * Math.PI / 180) * Math.cos(nLat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance;
};

export const getProducts = async (
  terms?: string[], 
  materialIds?: number[], 
  category?: string, 
  storeLimit: number = 3,
  userLoc?: { lat: number, lng: number } | null
) => {
  try {
    const { data: storesData, error: storesError } = await supabase
      .from('stores')
      .select('id, name, whatsapp, address, location');
    
    if (storesError) throw storesError;

    const nearbyStoreIds: string[] = [];
    const storesInfoMap: Record<string, any> = {};

    (storesData || []).forEach(s => {
      const idKey = String(s.id).trim().toLowerCase();
      let lat = null, lng = null;
      if (s.location) {
        const parsed = parseLocation(s.location);
        if (parsed) { lat = parsed.lat; lng = parsed.lng; }
      }

      let dist = null;
      if (userLoc && lat !== null && lng !== null) {
        dist = calculateDistance(userLoc.lat, userLoc.lng, lat, lng);
      }

      // REGRA ATUALIZADA: Apenas lojas num raio de 50km
      if (!userLoc || (dist !== null && dist <= 50)) {
        nearbyStoreIds.push(idKey);
        storesInfoMap[idKey] = { ...s, dist, lat, lng };
      }
    });

    if (nearbyStoreIds.length === 0) return [];

    let query = supabase.from('products').select('*').eq('active', true);
    query = query.in('store_id', nearbyStoreIds);
    
    if (materialIds && materialIds.length > 0) {
      query = query.in('material_id', materialIds);
    } else if (category && category !== 'Todos') {
      query = query.eq('category', category);
    } else if (terms && terms.length > 0) {
      const orFilter = terms.map(t => `name.ilike.%${t.trim()}%`).join(',');
      query = query.or(orFilter);
    }

    const { data: productsData, error: productsError } = await query;
    if (productsError) throw productsError;

    const storePresenceCount: Record<string, number> = {};
    productsData.forEach(p => {
      const sid = String(p.store_id).trim().toLowerCase();
      storePresenceCount[sid] = (storePresenceCount[sid] || 0) + 1;
    });

    const finalStoreIds = nearbyStoreIds
      .filter(id => storePresenceCount[id] > 0)
      .sort((a, b) => (storesInfoMap[a].dist || 999) - (storesInfoMap[b].dist || 999))
      .slice(0, storeLimit);

    const finalProducts = productsData
      .filter(p => finalStoreIds.includes(String(p.store_id).trim().toLowerCase()))
      .map(p => {
        const sid = String(p.store_id).trim().toLowerCase();
        const s = storesInfoMap[sid];
        return {
          ...p,
          store_name: s.name,
          whatsapp: s.whatsapp,
          lat: s.lat,
          lng: s.lng,
          distance: s.dist
        };
      });

    return finalProducts;
  } catch (err) {
    console.error("Erro getProducts:", err);
    return [];
  }
};
