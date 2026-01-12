
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const supabaseUrl = '';
const supabaseKey = 
/**
 * Cliente Supabase configurado para o MVP.
 * Nota: A chave anon é segura para uso client-side com RLS ativo.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: { 'x-application-name': 'cotaobra-mvp' }
  }
});

/**
 * Busca produtos otimizada para MVP com suporte a busca geográfica.
 */
export const getProducts = async (radiusKm: number, lat: number, lng: number, term?: string) => {
  const searchTerm = term && term.trim() !== '' ? term : '';
  
  console.info(`[CotaObra] Buscando: "${searchTerm || 'Tudo'}" num raio de ${radiusKm}km`);

  try {
    // Tenta usar a função RPC de busca por proximidade
    const { data, error } = await supabase.rpc('nearby_products', {
      user_lat: parseFloat(lat.toString()),
      user_lng: parseFloat(lng.toString()),
      radius_km: parseFloat(radiusKm.toString()),
      search_term: searchTerm
    });

    if (!error && data) return data;
    
    if (error) {
      console.warn("[CotaObra] RPC indisponível ou erro:", error.message);
      // Se o erro for de função não encontrada, ele cairá no fallback abaixo automaticamente
    }
  } catch (err) {
    console.error("[CotaObra] Erro de conexão RPC:", err);
  }

  // FALLBACK: Busca simples caso a infraestrutura geográfica do DB ainda não esteja 100%
  try {
    let query = supabase
      .from('products')
      .select(`
        id, name, description, category, price, image_url, material_id,
        stores ( name, whatsapp, address )
      `)
      .eq('active', true);

    if (searchTerm) {
      query = query.ilike('name', `%${searchTerm}%`);
    }

    const { data, error } = await query.limit(50);
    if (error) throw error;

    return (data || []).map(p => ({
      ...p,
      store_name: (p.stores as any)?.name || 'Loja Parceira',
      whatsapp: (p.stores as any)?.whatsapp,
      address: (p.stores as any)?.address,
      distance_km: null // No fallback não temos o cálculo de distância
    }));
  } catch (fallbackError) {
    console.error("[CotaObra] Falha crítica no banco de dados:", fallbackError);
    return [];
  }
};
