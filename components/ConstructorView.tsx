
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Store, MasterMaterial } from '../types';
import { getProducts, calculateDistance, supabase, MASTER_CATALOG_DATA } from '../supabase';

const CATEGORY_ICONS: Record<string, string> = {
  'Cimento': 'fa-fill-drip',
  'Agregados': 'fa-mountain',
  'Aço': 'fa-republican',
  'Hidráulica': 'fa-faucet',
  'Elétrica': 'fa-bolt',
  'Alvenaria': 'fa-border-all',
  'Cobertura': 'fa-home',
  'Ferramentas': 'fa-tools',
  'Acabamento': 'fa-brush',
  'default': 'fa-box'
};

const CATEGORY_COLORS: Record<string, string> = {
  'Cimento': 'bg-gray-100 text-gray-600',
  'Agregados': 'bg-amber-100 text-amber-700',
  'Aço': 'bg-blue-100 text-blue-700',
  'Hidráulica': 'bg-cyan-100 text-cyan-700',
  'Elétrica': 'bg-yellow-100 text-yellow-700',
  'Alvenaria': 'bg-orange-100 text-orange-700',
  'Cobertura': 'bg-indigo-100 text-indigo-700',
  'Acabamento': 'bg-pink-100 text-pink-700',
  'default': 'bg-orange-50 text-orange-600'
};

interface ConstructorViewProps {
  preSelected?: MasterMaterial[];
  onOpenAIPlanner?: () => void;
  aiSuggestions?: {materialId: number, quantity: string, rationale?: string}[];
}

export const ConstructorView: React.FC<ConstructorViewProps> = ({ 
  preSelected = [], 
  onOpenAIPlanner,
  aiSuggestions = [] 
}) => {
  const [viewMode, setViewMode] = useState<'search' | 'catalog'>('catalog');
  const [searchTerm, setSearchTerm] = useState('');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [searchRadius, setSearchRadius] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [realResults, setRealResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [selectedMaterials, setSelectedMaterials] = useState<MasterMaterial[]>(preSelected);
  const [masterCatalog, setMasterCatalog] = useState<MasterMaterial[]>(MASTER_CATALOG_DATA);
  const [activeCatalogCategory, setActiveCatalogCategory] = useState<string | null>(null);
  const [showCartSummary, setShowCartSummary] = useState(false);

  useEffect(() => {
    fetchMasterCatalog();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          if (preSelected.length > 0) {
            handleQuotation(preSelected, loc);
          }
        },
        (err) => console.warn("Erro de geolocalização:", err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const fetchMasterCatalog = async () => {
    const { data } = await supabase.from('materiais').select('*').eq('ativo', true).order('categoria', { ascending: true });
    if (data && data.length > 0) {
      setMasterCatalog(prev => {
        const merged = [...prev];
        data.forEach(m => {
          if (!merged.find(x => x.id === m.id)) merged.push(m);
        });
        return merged.sort((a,b) => a.nome.localeCompare(b.nome));
      });
    }
  };

  const categories = useMemo(() => {
    return Array.from(new Set(masterCatalog.map(m => m.categoria))).sort();
  }, [masterCatalog]);

  const toggleMaterialSelection = (mat: MasterMaterial) => {
    setSelectedMaterials(prev => {
      const isSelected = prev.find(m => m.id === mat.id);
      if (isSelected) return prev.filter(m => m.id !== mat.id);
      return [...prev, mat];
    });
  };

  const handleQuotation = async (mats: MasterMaterial[], locOverride?: {lat: number, lng: number}) => {
    if (mats.length === 0) return;
    setLoading(true);
    setHasSearched(true);
    setShowCartSummary(false);
    try {
      const ids = mats.map(m => Number(m.id));
      const data = await getProducts(undefined, ids, undefined, 3, locOverride || userLocation, searchRadius);
      setRealResults(data || []);
      setViewMode('search'); 
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const data = await getProducts([searchTerm], undefined, undefined, 3, userLocation, searchRadius);
      setRealResults(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const matrixData = useMemo(() => {
    if (!hasSearched || realResults.length === 0) return { stores: [], rows: [] };
    const storesMap = new Map();

    realResults.forEach(item => {
      const storeIdRaw = String(item.store_id || 'unknown').trim().toLowerCase();
      if (!storesMap.has(storeIdRaw)) {
        storesMap.set(storeIdRaw, {
          id: storeIdRaw,
          name: item.store_name, 
          whatsapp: item.whatsapp,
          distance: item.distance,
          totalPrice: 0,
          itemsCount: 0
        });
      }
    });

    const stores = Array.from(storesMap.values()).slice(0, 3);
    const baseMaterialIds = Array.from(new Set(realResults.map(r => Number(r.material_id))));
    
    const rows = baseMaterialIds.map(mid => {
      const samples = realResults.filter(r => Number(r.material_id) === mid);
      const first = samples[0];
      const aiSug = aiSuggestions.find(s => Number(s.materialId) === mid);
      
      const storePrices: Record<string, { price: number, isBest: boolean }> = {};
      let minPrice = Infinity;

      stores.forEach(store => {
        const match = samples.find(s => String(s.store_id || '').trim().toLowerCase() === store.id);
        if (match) {
          storePrices[store.id] = { price: match.price, isBest: false };
          if (match.price < minPrice) minPrice = match.price;
          store.totalPrice += (match.price * Number(aiSug?.quantity || 1));
          store.itemsCount++;
        }
      });

      Object.keys(storePrices).forEach(sid => {
        if (storePrices[sid].price === minPrice) storePrices[sid].isBest = true;
      });

      return { id: mid, name: first.name, unit: (first.metadata as any)?.unit || 'UN', quantity: aiSug ? aiSug.quantity : "1", storePrices };
    });

    stores.sort((a, b) => a.totalPrice - b.totalPrice);
    return { stores, rows };
  }, [realResults, aiSuggestions, hasSearched]);

  return (
    <div className="p-4 space-y-6 max-w-full mx-auto pb-12 bg-gray-50/50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Localização e Raio */}
        <div className="bg-white px-6 py-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-6">
            <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                    <i className="fas fa-location-dot"></i>
                </div>
                <div>
                    <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">GPS</p>
                    <p className="text-[11px] font-bold text-slate-800 uppercase leading-none">{userLocation ? 'Ativo' : 'Buscando...'}</p>
                </div>
            </div>

            <div className="flex-1 w-full">
                <div className="flex justify-between items-center mb-1 px-1">
                    <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Raio de Busca</p>
                    <span className="text-[10px] font-black text-orange-600">{searchRadius} KM</span>
                </div>
                <input 
                    type="range" min="1" max="50" step="1"
                    value={searchRadius}
                    onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600"
                />
            </div>
        </div>

        {/* Resumo do Pedido */}
        {selectedMaterials.length > 0 && (
          <div className="bg-slate-900 text-white p-5 rounded-[2rem] shadow-xl flex items-center justify-between animate-in slide-in-from-top-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center">
                <i className="fas fa-shopping-cart text-sm"></i>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-tight">{selectedMaterials.length} itens selecionados</p>
                <button 
                  onClick={() => setShowCartSummary(!showCartSummary)}
                  className="text-[9px] font-bold uppercase text-orange-400 tracking-widest hover:text-orange-300 flex items-center gap-1"
                >
                  Conferir Lista <i className={`fas fa-chevron-${showCartSummary ? 'up' : 'down'}`}></i>
                </button>
              </div>
            </div>
            <button 
              onClick={() => handleQuotation(selectedMaterials)}
              className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all flex items-center gap-2"
            >
              Cotar <i className="fas fa-bolt"></i>
            </button>
          </div>
        )}

        {/* Detalhes do Carrinho */}
        {showCartSummary && selectedMaterials.length > 0 && (
          <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm flex flex-wrap gap-2 animate-in fade-in zoom-in-95">
            {selectedMaterials.map(m => (
              <div key={m.id} className="bg-gray-50 px-3 py-2 rounded-xl flex items-center gap-2">
                <span className="text-[9px] font-black text-slate-700 uppercase">{m.nome}</span>
                <button onClick={() => toggleMaterialSelection(m)} className="text-gray-300 hover:text-red-500">
                  <i className="fas fa-times-circle"></i>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Toggle Catalogo / Orçamento */}
        <div className="flex justify-center">
          <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
            <button 
              onClick={() => setViewMode('search')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'search' ? 'bg-slate-900 text-white shadow-lg' : 'text-gray-400'}`}
            >
              <i className="fas fa-list-check mr-2"></i> Orçamento
            </button>
            <button 
              onClick={() => {
                setViewMode('catalog');
                setActiveCatalogCategory(null);
              }}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'catalog' ? 'bg-slate-900 text-white shadow-lg' : 'text-gray-400'}`}
            >
              <i className="fas fa-th-large mr-2"></i> Catálogo
            </button>
          </div>
        </div>

        {viewMode === 'search' ? (
          /* ÁREA DE RESULTADOS REDESENHADA (SEM CORTE) */
          <div className="w-full space-y-6">
            {loading ? (
              <div className="py-20 text-center flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Processando orçamentos...</p>
              </div>
            ) : (hasSearched && realResults.length > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-500">
                {matrixData.stores.map((store) => (
                  <div key={store.id} className="bg-white rounded-[2.5rem] shadow-lg border border-gray-100 overflow-hidden flex flex-col">
                    {/* Header da Loja */}
                    <div className="bg-slate-900 p-6 text-center text-white space-y-3">
                      <h4 className="text-xs font-black uppercase tracking-tight truncate">{store.name}</h4>
                      <div className="flex items-center justify-center gap-2">
                        <span className="bg-orange-600 text-[10px] px-3 py-1 rounded-full font-black uppercase">
                          <i className="fas fa-location-arrow mr-1"></i> {store.distance?.toFixed(1) || '0'} KM
                        </span>
                      </div>
                      <button 
                        onClick={() => window.open(`https://wa.me/${store.whatsapp}`, '_blank')}
                        className="w-full bg-white text-slate-900 py-3 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
                      >
                        <i className="fab fa-whatsapp text-green-500 text-base"></i> Fechar no Zap
                      </button>
                    </div>

                    {/* Lista de Preços na Loja */}
                    <div className="flex-1 p-5 space-y-3">
                      {matrixData.rows.map(row => {
                        const cell = row.storePrices[store.id];
                        return (
                          <div key={row.id} className={`p-3 rounded-2xl border ${cell?.isBest ? 'border-orange-200 bg-orange-50/50' : 'border-gray-50'}`}>
                            <p className="text-[9px] font-black text-slate-800 uppercase leading-none truncate mb-1">{row.name}</p>
                            <div className="flex justify-between items-end">
                              <span className="text-[8px] font-bold text-gray-400 uppercase">Qtd: {row.quantity}</span>
                              <span className={`text-[11px] font-black ${cell ? 'text-slate-900' : 'text-gray-200 italic'}`}>
                                {cell ? `R$ ${cell.price.toFixed(2).replace('.', ',')}` : 'N/A'}
                              </span>
                            </div>
                            {cell?.isBest && <span className="text-[7px] font-black uppercase text-orange-600 block mt-1">Melhor Preço</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer da Loja (Total) */}
                    <div className="p-6 bg-slate-50 border-t border-gray-100 text-center">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Orçado</p>
                       <p className="text-2xl font-black text-slate-900 italic">
                         <span className="text-[10px] not-italic mr-1 text-slate-400">R$</span>
                         {store.totalPrice.toFixed(2).replace('.', ',')}
                       </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center bg-white rounded-[3rem] border border-gray-100 max-w-2xl mx-auto px-10">
                 <div className="w-16 h-16 bg-gray-50 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-clipboard-list text-2xl text-gray-300"></i>
                 </div>
                 <p className="text-slate-900 font-black uppercase text-xs tracking-tight italic">Nenhum orçamento ativo</p>
                 <p className="text-gray-400 font-bold uppercase text-[9px] mt-2 tracking-widest">Acesse o catálogo para escolher seus materiais.</p>
                 <button onClick={() => setViewMode('catalog')} className="mt-8 bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg">Ver Catálogo</button>
              </div>
            )}
          </div>
        ) : (
          /* ÁREA DO CATÁLOGO */
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            {!activeCatalogCategory ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {categories.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setActiveCatalogCategory(cat)}
                    className="bg-white p-6 rounded-[2rem] border border-gray-100 text-center hover:border-orange-400 hover:shadow-lg transition-all group flex flex-col items-center gap-3"
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.default} transition-transform group-hover:scale-110`}>
                      <i className={`fas ${CATEGORY_ICONS[cat] || 'fa-box'} text-xl`}></i>
                    </div>
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-tight">{cat}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2 mb-2">
                  <button 
                    onClick={() => setActiveCatalogCategory(null)}
                    className="text-orange-600 text-[10px] font-black uppercase flex items-center gap-2"
                  >
                    <i className="fas fa-arrow-left"></i> Categorias
                  </button>
                  <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{activeCatalogCategory}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {masterCatalog
                    .filter(m => m.categoria === activeCatalogCategory)
                    .map(m => {
                      const isSelected = selectedMaterials.find(sm => sm.id === m.id);
                      return (
                        <button 
                          key={m.id}
                          onClick={() => toggleMaterialSelection(m)}
                          className={`p-5 rounded-[1.5rem] border text-left transition-all group flex items-center gap-4 relative overflow-hidden ${isSelected ? 'bg-orange-600 border-orange-600 text-white shadow-md' : 'bg-white border-gray-100 text-slate-800 hover:border-orange-300'}`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isSelected ? 'bg-white/20' : 'bg-gray-50 text-gray-400'}`}>
                            <i className={`fas ${CATEGORY_ICONS[m.categoria] || 'fa-box'} text-lg`}></i>
                          </div>
                          <div className="flex-1">
                            <p className={`text-[11px] font-black uppercase leading-tight ${isSelected ? 'text-white' : 'text-slate-800'}`}>{m.nome}</p>
                            <p className={`text-[8px] font-bold uppercase mt-1 tracking-widest ${isSelected ? 'text-orange-100' : 'text-gray-400'}`}>{m.unidade}</p>
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-4 animate-in zoom-in">
                              <i className="fas fa-check-circle text-white text-xs"></i>
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
