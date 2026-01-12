
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

/**
 * IMPORTANTE: No ambiente de desenvolvimento local (Vite/React), 
 * variáveis de ambiente costumam usar 'import.meta.env'.
 * No ambiente de execução desta plataforma, usamos 'process.env'.
 */
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';

// Tentamos ler de várias fontes comuns para evitar que venha vazio
const supabaseKey = process.env.VITE_SUPABASE_KEY || (window as any).VITE_SUPABASE_KEY || '';

if (!supabaseKey) {
  console.error("[CotaObra] CRÍTICO: VITE_SUPABASE_KEY não encontrada. O banco de dados não funcionará.");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

/**
 * Busca produtos com suporte a geolocalização, limitado a 10 resultados para performance.
 */
export const getProducts = async (radiusKm: number, lat: number, lng: number, term?: string) => {
  const searchTerm = term && term.trim() !== '' ? term : '';
  
  try {
    // Chamada RPC para busca geográfica (PostGIS necessária no Supabase)
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

  // Fallback para busca simples (sem geolocalização exata, apenas por nome/categoria)
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
    console.error("[CotaObra] Erro no fallback de produtos:", err);
    return [];
  }
};
