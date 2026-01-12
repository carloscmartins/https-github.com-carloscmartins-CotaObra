
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

/**
 * CONFIGURAÇÃO DE CHAVES:
 * 1. Você pode configurar no ambiente (Vercel/GitHub/Vite) como VITE_SUPABASE_KEY
 * 2. OU pode colar a chave diretamente abaixo entre as aspas de 'SUA_CHAVE_AQUI'
 */
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';

// Adicione sua chave no campo abaixo caso o process.env não esteja funcionando no seu ambiente
const MINHA_CHAVE_MANUAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkaXN0b2l1cXRlZ25ubXNsdGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAzNjIsImV4cCI6MjA4MzU2NjM2Mn0.aeLAzOlJZqcnC5fIvuAvUmBPXMLKGOTUyuYgKLqGRfA'; 

const supabaseKey = process.env.VITE_SUPABASE_KEY || (window as any).VITE_SUPABASE_KEY || MINHA_CHAVE_MANUAL;

if (!supabaseKey) {
  console.error("[CotaObra] CRÍTICO: Chave do Supabase não encontrada. Insira-a no arquivo supabase.ts na variável MINHA_CHAVE_MANUAL.");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

/**
 * Busca produtos com suporte a geolocalização, limitado a 10 resultados.
 */
export const getProducts = async (radiusKm: number, lat: number, lng: number, term?: string) => {
  const searchTerm = term && term.trim() !== '' ? term : '';
  
  try {
    const { data, error } = await supabase.rpc('nearby_products', {
      user_lat: parseFloat(lat.toString()),
      user_lng: parseFloat(lng.toString()),
      radius_km: parseFloat(radiusKm.toString()),
      search_term: searchTerm
    });

    if (!error && data) return data.slice(0, 10);
  } catch (err) {
    console.error("[CotaObra] Falha ao consultar RPC geográfica:", err);
  }

  try {
    let query = supabase
      .from('products')
      .select(`
        id, name, description, category, price, image_url, material_id,
        stores ( name, whatsapp, address )
      `)
      .eq('active', true);

    if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);

    const { data, error } = await query.limit(10);
    if (error) throw error;

    return (data || []).map(p => ({
      ...p,
      store_name: (p.stores as any)?.name || 'Loja Parceira',
      whatsapp: (p.stores as any)?.whatsapp,
      address: (p.stores as any)?.address,
      distance_km: null
    }));
  } catch (err) {
    return [];
  }
};
