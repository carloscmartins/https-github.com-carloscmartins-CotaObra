
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
  const [viewMode, setViewMode] = useState<'search' | 'catalog'>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [searchRadius, setSearchRadius] = useState<number>(15); // Default 15km
  const [loading, setLoading] = useState(false);
  const [realResults, setRealResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [masterCatalog, setMasterCatalog] = useState<MasterMaterial[]>(MASTER_CATALOG_DATA);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchMasterCatalog();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          if (preSelected.length > 0) {
            handleInitialSearch(preSelected, loc);
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

  const handleInitialSearch = async (mats: MasterMaterial[], loc?: {lat: number, lng: number}) => {
    setLoading(true);
    try {
      const ids = mats.map(m => Number(m.id));
      const data = await getProducts(undefined, ids, undefined, 3, loc || userLocation, searchRadius);
      setRealResults(data || []);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSearch = async (termOverride?: string) => {
    const term = termOverride || searchTerm.trim();
    if (!term) return;
    
    setLoading(true);
    try {
      const data = await getProducts([term], undefined, undefined, 3, userLocation, searchRadius);
      if (data && data.length > 0) {
        if (!searchTerms.includes(term)) setSearchTerms(prev => [...prev, term]);
        setRealResults(prev => {
          const filteredNew = data.filter(newItem => !prev.find(p => p.id === newItem.id));
          return [...prev, ...filteredNew];
        });
        setHasSearched(true);
        setViewMode('search');
      } else if (termOverride) {
         // Caso clique no catálogo e não ache nada no raio, limpa busca anterior pra não confundir
         setHasSearched(true);
         setRealResults([]);
      }
      setSearchTerm('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Efeito para re-pesquisar quando o raio muda e já houve uma busca
  useEffect(() => {
    if (hasSearched && (searchTerms.length > 0 || preSelected.length > 0)) {
        const timer = setTimeout(() => {
            if (preSelected.length > 0) handleInitialSearch(preSelected);
            else if (searchTerms.length > 0) {
                // Reaplica busca para os termos atuais
                const redo = async () => {
                    setLoading(true);
                    const data = await getProducts(searchTerms, undefined, undefined, 3, userLocation, searchRadius);
                    setRealResults(data || []);
                    setLoading(false);
                };
                redo();
            }
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [searchRadius]);

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
  }, [realResults, aiSuggestions, hasSearched, userLocation]);

  return (
    <div className="p-4 space-y-6 max-w-full mx-auto pb-24 bg-gray-50/50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Raio de Busca e Localização */}
        <div className="bg-white px-8 py-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                    <i className="fas fa-location-dot"></i>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Sua Localização</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{userLocation ? 'Ativa (GPS)' : 'Buscando sinal...'}</p>
                </div>
            </div>

            <div className="flex-1 w-full max-w-xs">
                <div className="flex justify-between items-center mb-3">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Raio de Busca</p>
                    <span className="bg-slate-900 text-white px-3 py-1 rounded-full text-[10px] font-black italic">{searchRadius} KM</span>
                </div>
                <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    step="1"
                    value={searchRadius}
                    onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600"
                />
                <div className="flex justify-between mt-1">
                    <span className="text-[8px] font-bold text-gray-300">1km</span>
                    <span className="text-[8px] font-bold text-gray-300">50km</span>
                </div>
            </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
            <button 
              onClick={() => setViewMode('search')}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'search' ? 'bg-slate-900 text-white shadow-lg' : 'text-gray-400'}`}
            >
              <i className="fas fa-search mr-2"></i> Busca
            </button>
            <button 
              onClick={() => setViewMode('catalog')}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'catalog' ? 'bg-slate-900 text-white shadow-lg' : 'text-gray-400'}`}
            >
              <i className="fas fa-th-large mr-2"></i> Catálogo
            </button>
          </div>
        </div>

        {viewMode === 'search' ? (
          <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100 space-y-6 animate-in fade-in">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2 empty:hidden">
                {searchTerms.map(t => (
                  <span key={t} className="bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-[10px] font-black uppercase flex items-center gap-2 border border-orange-200">
                    {t}
                    <button onClick={() => {
                      setSearchTerms(prev => prev.filter(x => x !== t));
                      const remainingResults = realResults.filter(p => !p.name.toLowerCase().includes(t.toLowerCase()));
                      setRealResults(remainingResults);
                      if (remainingResults.length === 0) setHasSearched(false);
                    }} className="hover:text-orange-900"><i className="fas fa-times-circle"></i></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  className="flex-1 bg-gray-50/50 border border-gray-100 rounded-[1.5rem] px-6 py-5 text-sm font-bold outline-none focus:border-orange-600 shadow-inner"
                  placeholder="Ex: Cimento, Tijolo, Tubo..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleExecuteSearch()}
                />
                <button onClick={() => handleExecuteSearch()} className="bg-slate-900 text-white px-7 rounded-[1.5rem] font-black uppercase text-[12px] shadow-xl transition-all active:scale-95"><i className="fas fa-search"></i></button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              <button 
                onClick={() => setSelectedCategory(null)}
                className={`px-5 py-3 rounded-full text-[9px] font-black uppercase whitespace-nowrap transition-all ${!selectedCategory ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'bg-white text-gray-400 border border-gray-100'}`}
              >
                Todos
              </button>
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-5 py-3 rounded-full text-[9px] font-black uppercase whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'bg-white text-gray-400 border border-gray-100'}`}
                >
                  <i className={`fas ${CATEGORY_ICONS[cat] || 'fa-box'} mr-2`}></i> {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {masterCatalog
                .filter(m => !selectedCategory || m.categoria === selectedCategory)
                .map(m => (
                <button 
                  key={m.id}
                  onClick={() => handleExecuteSearch(m.nome)}
                  className="bg-white p-6 rounded-[2rem] border border-gray-100 text-left hover:border-orange-400 hover:shadow-xl transition-all group flex items-center gap-4"
                >
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors">
                    <i className={`fas ${CATEGORY_ICONS[m.categoria] || 'fa-box'} text-xl`}></i>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800 uppercase leading-tight">{m.nome}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase mt-1 tracking-widest">{m.unidade}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-7xl mx-auto mt-8">
        {loading && !hasSearched ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Buscando orçamentos ASAP...</p>
          </div>
        ) : (hasSearched && realResults.length > 0) ? (
          <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in duration-500">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="sticky left-0 z-30 bg-slate-900 p-8 text-left min-w-[280px] border-r border-white/5 shadow-[4px_0_10px_rgba(0,0,0,0.3)]">
                      <div className="flex flex-col">
                        <span className="text-[12px] font-black uppercase tracking-widest text-orange-500 italic flex items-center gap-2">
                          <i className="fas fa-hard-hat text-xs"></i> ASAPOBRA
                        </span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase mt-1 tracking-[0.2em]">Seu Pedido</span>
                      </div>
                    </th>
                    {matrixData.stores.map(store => (
                      <th key={store.id} className="p-6 min-w-[220px] text-center border-r border-white/5 last:border-0">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-black uppercase truncate w-full max-w-[180px] mb-1" title={store.name}>{store.name}</span>
                          <div className={`px-4 py-2 rounded-full flex items-center gap-2 border shadow-lg transition-all ${store.distance !== null ? 'bg-orange-600 border-orange-500 text-white scale-110' : 'bg-white/5 border-white/5 text-slate-500'}`}>
                            <i className="fas fa-route text-[9px]"></i>
                            <span className="text-[11px] font-black uppercase tracking-tighter">
                                {store.distance !== null ? `${store.distance.toFixed(1)} km` : 'N/A'}
                            </span>
                          </div>
                          <button onClick={() => window.open(`https://wa.me/${store.whatsapp}`, '_blank')} className="bg-white text-slate-900 text-[9px] font-black px-5 py-2.5 rounded-xl uppercase shadow-lg transition-all mt-3 active:scale-95 flex items-center gap-2">
                            <i className="fab fa-whatsapp text-green-500 text-lg"></i> Fechar ASAP
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.rows.map((row, idx) => (
                    <tr key={row.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'} border-b border-gray-100 last:border-0 hover:bg-orange-50/30 transition-colors`}>
                      <td className="sticky left-0 z-20 p-8 bg-inherit border-r border-gray-100 shadow-[4px_0_15px_rgba(0,0,0,0.03)]">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-800 uppercase leading-tight">{row.name}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase mt-1.5 tracking-tighter">Qtd: {row.quantity} {row.unit}</span>
                        </div>
                      </td>
                      {matrixData.stores.map(store => {
                        const cell = row.storePrices[store.id];
                        return (
                          <td key={store.id} className="p-6 text-center border-r border-gray-50 last:border-0">
                            {cell ? (
                              <div className={`inline-block px-5 py-4 rounded-3xl transition-transform hover:scale-105 ${cell.isBest ? 'bg-orange-50 text-orange-700 ring-2 ring-orange-100 shadow-sm' : ''}`}>
                                <p className="text-sm font-black italic">R$ {cell.price.toFixed(2).replace('.', ',')}</p>
                                {cell.isBest && <span className="text-[7px] font-black uppercase block mt-1 tracking-widest text-orange-600">Melhor Opção</span>}
                              </div>
                            ) : <span className="text-[10px] font-black text-gray-200 uppercase tracking-widest italic">Indisponível</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-900">
                    <td className="sticky left-0 z-20 bg-slate-50 p-8 border-r border-gray-200 shadow-[4px_0_15px_rgba(0,0,0,0.03)]">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Subtotal ASAP</span>
                    </td>
                    {matrixData.stores.map(store => (
                      <td key={store.id} className="p-8 text-center border-r border-gray-100 last:border-0">
                        <div className="flex flex-col items-center">
                          <div className={`text-2xl font-black text-slate-900 italic`}>
                            <span className="text-[10px] mr-1 text-slate-400 not-italic">R$</span>
                            {store.totalPrice.toFixed(2).replace('.', ',')}
                          </div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase mt-1 tracking-tight">{store.itemsCount} itens</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="py-32 text-center bg-white rounded-[4rem] shadow-sm border border-gray-100 max-w-2xl mx-auto px-10">
             <div className="w-24 h-24 bg-orange-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 transform rotate-3 shadow-lg shadow-orange-100">
                <i className="fas fa-hard-hat text-4xl text-orange-600"></i>
             </div>
             <p className="text-slate-900 font-black uppercase text-sm tracking-tight italic">Sua obra As Soon As Possible</p>
             <p className="text-gray-400 font-bold uppercase text-[10px] mt-3 tracking-widest leading-loose">
                {hasSearched ? `Nenhum material encontrado em um raio de ${searchRadius}km.` : 'Compare preços ou navegue no catálogo para começar.'}
             </p>
          </div>
        )}
      </div>
    </div>
  );
};
