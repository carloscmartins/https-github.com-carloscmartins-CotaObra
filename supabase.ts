
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';
const MINHA_CHAVE_MANUAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkaXN0b2l1cXRlZ25ubXNsdGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAzNjIsImV4cCI6MjA4MzU2NjM2Mn0.aeLAzOlJZqcnC5fIvuAvUmBPXMLKGOTUyuYgKLqGRfA'; 

const supabaseKey = process.env.VITE_SUPABASE_KEY || (window as any).VITE_SUPABASE_KEY || MINHA_CHAVE_MANUAL;

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Converte diversos formatos de localização do Supabase/PostGIS para {lat, lng}
 */
export function parseLocation(loc: any): { lat: number; lng: number } | null {
  if (!loc) return null;
  
  // Se já for um objeto com lat/lng
  if (typeof loc === 'object') {
    if (loc.lat !== undefined && loc.lng !== undefined) return { lat: Number(loc.lat), lng: Number(loc.lng) };
    if (Array.isArray(loc.coordinates)) {
      // GeoJSON standard: [longitude, latitude]
      return { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]) };
    }
  }

  const locStr = String(loc);
  
  // Formato WKT: POINT(lng lat)
  if (locStr.toUpperCase().includes('POINT')) {
    try {
      const matches = locStr.match(/\(([^)]+)\)/);
      if (matches && matches[1]) {
        const parts = matches[1].trim().split(/\s+/);
        return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) };
      }
    } catch (e) {}
  }

  // Formato EWKB (Hexadecimal comum no PostGIS/Supabase)
  // Ex: 0101000020E6100000...
  if (locStr.length >= 32 && /^[0-9A-Fa-f]+$/.test(locStr)) {
    try {
      // O PostGIS por padrão retorna Hex EWKB. 
      // Em SRID 4326, os últimos 16 bytes costumam ser Latitude (8) e Longitude (8) em Big/Little Endian.
      // Versão simplificada de extração de Hex:
      const hexToDouble = (hex: string) => {
        const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const view = new DataView(bytes.buffer);
        return view.getFloat64(0, true); // Little-endian é o comum no PostGIS
      };
      
      // No formato EWKB, as coordenadas 8-byte doubles começam após o header
      // Header padrão 0101000020E6100000 tem 18 hex chars (9 bytes)
      // Coordenadas: Longitude (8 bytes / 16 chars), Latitude (8 bytes / 16 chars)
      const lng = hexToDouble(locStr.slice(18, 34));
      const lat = hexToDouble(locStr.slice(34, 50));
      
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    } catch (e) {
      console.error("Erro ao dar parse no Hex da localização:", e);
    }
  }

  return null;
}

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number | null => {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;
  
  const R = 6371; // Raio da Terra em KM
  const dLat = (nLat2 - nLat1) * Math.PI / 180;
  const dLon = (nLon2 - nLon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(nLat1 * Math.PI / 180) * Math.cos(nLat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

export const getProducts = async (
  terms?: string[], 
  materialIds?: number[], 
  category?: string, 
  storeLimit: number = 3,
  userLoc?: { lat: number, lng: number } | null,
  maxRadiusKm: number = 50
) => {
  try {
    const { data: storesData, error: storesError } = await supabase
      .from('stores')
      .select('id, name, whatsapp, location');
    
    if (storesError) throw storesError;

    const storesInfoMap: Record<string, any> = {};
    (storesData || []).forEach(s => {
      const idKey = String(s.id).toLowerCase();
      const parsed = parseLocation(s.location);
      let dist = null;
      
      if (userLoc && parsed) {
        dist = calculateDistance(userLoc.lat, userLoc.lng, parsed.lat, parsed.lng);
      }
      
      storesInfoMap[idKey] = { ...s, dist, coords: parsed };
    });

    const validStoreIds = Object.keys(storesInfoMap);
    if (validStoreIds.length === 0) return [];

    let query = supabase.from('products').select('*').eq('active', true).in('store_id', validStoreIds);
    
    if (materialIds && materialIds.length > 0) query = query.in('material_id', materialIds);
    else if (category && category !== 'Todos') query = query.eq('category', category);
    else if (terms && terms.length > 0) {
      const validTerms = terms.map(t => t.trim()).filter(t => t.length > 1);
      if (validTerms.length > 0) query = query.or(validTerms.map(t => `name.ilike.%${t}%`).join(','));
    }

    const { data: productsData, error: productsError } = await query;
    if (productsError) throw productsError;

    const nearbyProducts = (productsData || [])
      .map(p => {
        const sid = String(p.store_id).toLowerCase();
        const s = storesInfoMap[sid];
        return {
          ...p,
          store_name: s?.name || 'Loja Local',
          whatsapp: s?.whatsapp || '',
          distance: s?.dist ?? null
        };
      })
      .filter(p => {
        // Se temos localização do usuário e raio definido
        if (userLoc && maxRadiusKm) {
            return p.distance !== null && p.distance <= maxRadiusKm;
        }
        return true;
      });

    const storeIdsWithProducts = Array.from(new Set(nearbyProducts.map(p => String(p.store_id).toLowerCase())));
    
    const sortedStoreIds: string[] = (storeIdsWithProducts as string[])
      .sort((a, b) => (storesInfoMap[a]?.dist ?? 9999) - (storesInfoMap[b]?.dist ?? 9999))
      .slice(0, storeLimit);

    return nearbyProducts.filter(p => sortedStoreIds.includes(String(p.store_id).toLowerCase()));
  } catch (err: any) {
    console.error("Erro getProducts:", err);
    return [];
  }
};
