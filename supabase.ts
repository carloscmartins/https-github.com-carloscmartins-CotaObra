
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';
const MINHA_CHAVE_MANUAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkaXN0b2l1cXRlZ25ubXNsdGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAzNjIsImV4cCI6MjA4MzU2NjM2Mn0.aeLAzOlJZqcnC5fIvuAvUmBPXMLKGOTUyuYgKLqGRfA'; 

const supabaseKey = process.env.VITE_SUPABASE_KEY || (window as any).VITE_SUPABASE_KEY || MINHA_CHAVE_MANUAL;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const MASTER_CATALOG_DATA = [
  { id: 1, nome: "Cimento CP-II 50kg", categoria: "Cimento", unidade: "Saco", descricao: "Cimento multiuso para diversas aplicações." },
  { id: 2, nome: "Areia Fina", categoria: "Agregados", unidade: "m³", descricao: "Areia limpa para acabamentos e reboco." },
  { id: 3, nome: "Areia Média", categoria: "Agregados", unidade: "m³", descricao: "Areia para assentamento e concreto." },
  { id: 4, nome: "Pedra Brita 1", categoria: "Agregados", unidade: "m³", descricao: "Brita para concreto estrutural." },
  { id: 5, nome: "Cal Hidratada 20kg", categoria: "Cimento", unidade: "Saco", descricao: "Cal para argamassas de assentamento e revestimento." },
  { id: 10, nome: "Vergalhão CA-50 8mm (5/16) 12m", categoria: "Aço", unidade: "Barra", descricao: "Barra de aço para reforço estrutural." },
  { id: 11, nome: "Vergalhão CA-50 10mm (3/8) 12m", categoria: "Aço", unidade: "Barra", descricao: "Barra de aço de maior resistência." },
  { id: 20, nome: "Bloco de Concreto 14x19x39", categoria: "Alvenaria", unidade: "Milheiro", descricao: "Bloco estrutural de concreto." },
  { id: 21, nome: "Tijolo Baiano 8 Furos", categoria: "Alvenaria", unidade: "Milheiro", descricao: "Tijolo cerâmico para vedação." },
  { id: 30, nome: "Tubo Esgoto 100mm 6m", categoria: "Hidráulica", unidade: "Vara", descricao: "Tubo de PVC para esgoto." },
  { id: 40, nome: "Cabo Flexível 2,5mm² (Rolo 100m)", categoria: "Elétrica", unidade: "Rolo", descricao: "Cabo para circuitos residenciais." },
  { id: 50, nome: "Telha Brasilit 2,44x1,10 6mm", categoria: "Cobertura", unidade: "Folha", descricao: "Telha de fibrocimento durável." },
  { id: 60, nome: "Tinta Acrílica Branco Fosco 18L", categoria: "Acabamento", unidade: "Lata", descricao: "Tinta de alto rendimento." }
];

function parseLocation(loc: any): { lat: number; lng: number } | null {
  if (!loc) return null;
  if (typeof loc === 'object' && Array.isArray(loc.coordinates)) {
    return { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]) };
  }
  const locStr = String(loc);
  if (locStr.toUpperCase().includes('POINT')) {
    try {
      const matches = locStr.match(/\(([^)]+)\)/);
      if (matches && matches[1]) {
        const parts = matches[1].trim().split(/\s+/);
        return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) };
      }
    } catch (e) {}
  }
  if (locStr.length >= 42 && /^[0-9A-Fa-f]+$/.test(locStr)) {
    try {
      const readDouble = (hexPart: string) => {
        const bytes = new Uint8Array(hexPart.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const view = new DataView(bytes.buffer);
        return view.getFloat64(0, true);
      };
      const lng = readDouble(locStr.slice(-32, -16));
      const lat = readDouble(locStr.slice(-16));
      return { lat, lng };
    } catch (e) {}
  }
  return null;
}

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number | null => {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;
  const R = 6371;
  const dLat = (nLat2 - nLat1) * Math.PI / 180;
  const dLon = (nLon2 - nLon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(nLat1 * Math.PI / 180) * Math.cos(nLat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.abs(R * c);
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
      
      // Só adiciona se estiver dentro do raio ou se não tiver localização do usuário
      if (!userLoc || (dist !== null && dist <= maxRadiusKm)) {
        storesInfoMap[idKey] = { ...s, dist };
      }
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

    const nearbyProducts = (productsData || []).map(p => {
      const sid = String(p.store_id).toLowerCase();
      const s = storesInfoMap[sid];
      return {
        ...p,
        store_name: s?.name || 'Loja Local',
        whatsapp: s?.whatsapp || '',
        distance: s?.dist ?? null
      };
    });

    const storeIdsWithProducts = Array.from(new Set(nearbyProducts.map(p => String(p.store_id).toLowerCase())));
    const sortedStoreIds = storeIdsWithProducts
      .sort((a, b) => (storesInfoMap[a]?.dist ?? 9999) - (storesInfoMap[b]?.dist ?? 9999))
      .slice(0, storeLimit);

    return nearbyProducts.filter(p => sortedStoreIds.includes(String(p.store_id).toLowerCase()));
  } catch (err: any) {
    console.error("Erro getProducts:", err);
    return [];
  }
};
