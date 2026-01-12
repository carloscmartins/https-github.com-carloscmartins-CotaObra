
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// Em ambientes de produção (Vercel/Netlify), estas variáveis são injetadas automaticamente.
// Em desenvolvimento local, elas vêm do seu arquivo .env ou do ambiente de execução.
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://adistoiuqtegnnmsltlu.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkaXN0b2l1cXRlZ25ubXNsdGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAzNjIsImV4cCI6MjA4MzU2NjM2Mn0.aeLAzOlJZqcnC5fIvuAvUmBPXMLKGOTUyuYgKLqGRfA';

if (!supabaseKey) {
  console.warn("[CotaObra] Supabase Key não encontrada. Verifique as variáveis de ambiente.");
}

/**
 * Cliente Supabase configurado de forma segura.
 * As permissões de acesso são controladas pelas Policies (RLS) no painel do Supabase.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

/**
 * Busca produtos com suporte a geolocalização.
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

    if (!error && data) return data;
  } catch (err) {
    console.error("[CotaObra] Falha ao consultar RPC geográfica:", err);
  }

  // Fallback para busca simples se o RPC falhar
  try {
    let query = supabase
      .from('products')
      .select(`
        id, name, description, category, price, image_url, material_id,
        stores ( name, whatsapp, address )
      `)
      .eq('active', true);

    if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);

    const { data, error } = await query.limit(50);
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
