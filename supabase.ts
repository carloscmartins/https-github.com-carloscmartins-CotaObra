
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';
const MINHA_CHAVE_MANUAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkaXN0b2l1cXRlZ25ubXNsdGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAzNjIsImV4cCI6MjA4MzU2NjM2Mn0.aeLAzOlJZqcnC5fIvuAvUmBPXMLKGOTUyuYgKLqGRfA'; 

const supabaseKey = process.env.VITE_SUPABASE_KEY || (window as any).VITE_SUPABASE_KEY || MINHA_CHAVE_MANUAL;

export const supabase = createClient(supabaseUrl, supabaseKey);

function parseLocation(loc: any): { lat: number; lng: number } | null {
  if (!loc) return null;
  
  // Se já for um objeto com lat/lng (raro no retorno direto do PostGIS mas possível via RPC)
  if (typeof loc === 'object' && loc.lat && loc.lng) {
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  }

  const locStr = String(loc);

  // Caso 1: WKT (Well-Known Text) - POINT(lng lat)
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

  // Caso 2: Hex EWKB (Extendido Well-Known Binary) comum no Supabase/PostGIS
  // Formato: 0101000020E6100000...
  if (locStr.length >= 42) { 
    try {
      // O PostGIS costuma enviar em Little Endian. 
      // Coordenadas começam no offset 18 (após o header de SRID se existir) ou 10.
      // Vamos tentar um método mais simples: extrair do final da string hex se for POINT
      const readDouble = (hexPart: string) => {
        const bytes = new Uint8Array(hexPart.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const view = new DataView(bytes.buffer);
        return view.getFloat64(0, true);
      };
      
      // Para POINT (16 bytes para 2 doubles)
      const lng = readDouble(locStr.slice(-32, -16));
      const lat = readDouble(locStr.slice(-16));
      
      // Validação básica para evitar valores astronômicos caso o offset esteja errado
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
  
  // Filtro de sanidade: se lat/lng forem 0 ou valores de erro comuns
  if (nLat1 === 0 || nLat2 === 0) return null;

  const R = 6371; // Raio da Terra em KM
  const dLat = (nLat2 - nLat1) * Math.PI / 180;
  const dLon = (nLon2 - nLon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(nLat1 * Math.PI / 180) * Math.cos(nLat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  // Se a distância for maior que o diâmetro da terra, algo está errado nas coordenadas
  return distance > 20000 ? null : distance;
};

export const getCategories = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('materiais')
      .select('categoria')
      .eq('ativo', true);
    if (error) throw error;
    const cats = Array.from(new Set(data.map(m => m.categoria))).filter(Boolean) as string[];
    return cats.sort();
  } catch (err) {
    console.error("Erro getCategories:", err);
    return ["Acabamento", "Alvenaria", "Cimento", "Elétrica", "Hidráulica", "Pintura"];
  }
};

export const getProducts = async (terms?: string[], materialIds?: number[], category?: string) => {
  try {
    const { data: storesData, error: storesError } = await supabase
      .from('stores')
      .select('id, name, whatsapp, address, location');
    
    if (storesError) console.error("Erro ao buscar lojas:", storesError);

    const storeMap: Record<string, any> = {};
    (storesData || []).forEach(s => {
      const idKey = String(s.id).trim().toLowerCase();
      let lat = null, lng = null;
      if (s.location) {
        const parsed = parseLocation(s.location);
        if (parsed) { lat = parsed.lat; lng = parsed.lng; }
      }
      storeMap[idKey] = { name: s.name, whatsapp: s.whatsapp, lat, lng };
    });

    let query = supabase.from('products').select('*').eq('active', true);
    
    if (materialIds && materialIds.length > 0) {
      query = query.in('material_id', materialIds);
    } else if (category && category !== 'Todos') {
      query = query.eq('category', category);
    } else if (terms && terms.length > 0) {
      const orFilter = terms.map(t => `name.ilike.%${t.trim()}%`).join(',');
      query = query.or(orFilter);
    } else {
      query = query.limit(50);
    }

    const { data: productsData, error: productsError } = await query;
    if (productsError) throw productsError;
    if (!productsData) return [];

    return productsData.map(p => {
      const pStoreId = String(p.store_id || '').trim().toLowerCase();
      const storeInfo = storeMap[pStoreId];
      return {
        ...p,
        store_name: storeInfo?.name || `Loja Parceira`,
        whatsapp: storeInfo?.whatsapp || "",
        lat: storeInfo?.lat ?? null,
        lng: storeInfo?.lng ?? null
      };
    });
  } catch (err) {
    console.error("Erro getProducts:", err);
    return [];
  }
};
