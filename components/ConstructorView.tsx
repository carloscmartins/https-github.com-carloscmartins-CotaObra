
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Store, MasterMaterial } from '../types';
import { getProducts, calculateDistance, supabase } from '../supabase';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [excludedMaterialIds, setExcludedMaterialIds] = useState<Set<number>>(new Set());
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [loading, setLoading] = useState(false);
  const [realResults, setRealResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          setIsLocating(false);
          if (preSelected.length > 0) handleInitialSearch(preSelected, loc);
        },
        () => {
          console.warn("Localização negada.");
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const handleInitialSearch = async (mats: MasterMaterial[], loc?: {lat: number, lng: number}) => {
    setLoading(true);
    try {
      const ids = mats.map(m => Number(m.id));
      const data = await getProducts(undefined, ids, undefined, 3, loc || userLocation);
      setRealResults(data || []);
      setHasSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;
    
    setLoading(true);
    try {
      const data = await getProducts([term], undefined, undefined, 3, userLocation);
      if (data && data.length > 0) {
        if (!searchTerms.includes(term)) {
          setSearchTerms(prev => [...prev, term]);
        }
        
        setRealResults(prev => {
          const filteredNew = data.filter(newItem => !prev.find(p => p.id === newItem.id));
          return [...prev, ...filteredNew];
        });
        setHasSearched(true);
      }
      setSearchTerm('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const matrixData = useMemo(() => {
    if (!hasSearched) return { stores: [], rows: [] };
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
    
    const rows = baseMaterialIds
      .filter(mid => !excludedMaterialIds.has(mid))
      .map(mid => {
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
  }, [realResults, aiSuggestions, hasSearched, excludedMaterialIds]);

  return (
    <div className="p-4 space-y-6 max-w-full mx-auto pb-24 bg-gray-50/50 min-h-screen">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100 space-y-6 relative">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 empty:hidden">
              {searchTerms.map(t => (
                <span key={t} className="bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-[10px] font-black uppercase flex items-center gap-2 border border-orange-200 animate-in zoom-in-95">
                  {t}
                  <button onClick={() => {
                    setSearchTerms(prev => prev.filter(x => x !== t));
                    setRealResults(prev => prev.filter(p => !p.name.toLowerCase().includes(t.toLowerCase())));
                  }} className="hover:text-orange-900 transition-colors">
                    <i className="fas fa-times-circle"></i>
                  </button>
                </span>
              ))}
            </div>
            
            <div className="flex gap-2 relative">
              <div className="flex-1 relative">
                <input 
                  className="w-full bg-gray-50/50 border border-gray-100 rounded-[1.5rem] px-6 py-5 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white transition-all pr-12 shadow-inner"
                  placeholder="Busque cimento, tubos, tintas..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleExecuteSearch()}
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 transition-colors text-xs font-black uppercase p-2"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
              <button 
                onClick={handleExecuteSearch}
                className="bg-slate-950 text-white px-7 rounded-[1.5rem] font-black uppercase text-[12px] shadow-xl active:scale-95 transition-transform flex items-center justify-center min-w-[70px]"
              >
                {loading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-search"></i>}
              </button>
            </div>
          </div>
          
          <div className="flex justify-center pt-2">
            <div className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase border flex items-center gap-2 transition-all ${userLocation ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
              <i className={`fas ${userLocation ? 'fa-check-circle' : 'fa-exclamation-triangle'}`}></i>
              {userLocation 
                ? 'Filtrando num raio de 50km' 
                : isLocating ? 'Buscando sua posição...' : 'Localização inativa (filtro 50km desativado)'}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto mt-8">
        {loading && !hasSearched ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Buscando lojas num raio de 50km...</p>
          </div>
        ) : hasSearched && matrixData.stores.length > 0 ? (
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in duration-500">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="sticky left-0 z-30 bg-slate-950 p-8 text-left min-w-[280px] border-r border-white/5 shadow-[4px_0_10px_rgba(0,0,0,0.3)]">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black uppercase tracking-widest text-orange-500">Materiais</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase mt-1">Comparativo Regional</span>
                      </div>
                    </th>
                    {matrixData.stores.map(store => (
                      <th key={store.id} className="p-6 min-w-[220px] text-center border-r border-white/5 last:border-0">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-black uppercase truncate w-full max-w-[180px] mb-1" title={store.name}>
                            {store.name}
                          </span>
                          
                          <div className={`px-4 py-2 rounded-full flex items-center gap-2 border transition-all ${
                            store.distance !== null 
                            ? (store.distance < 10 ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-white/10 border-white/10 text-slate-300')
                            : 'bg-white/5 border-white/5 text-slate-500'
                          }`}>
                            <i className="fas fa-route text-[9px]"></i>
                            <span className="text-[10px] font-black uppercase whitespace-nowrap">
                              {store.distance !== null 
                                ? `${store.distance.toFixed(1)} km` 
                                : 'Dist. N/A'}
                            </span>
                          </div>

                          <button 
                            onClick={() => window.open(`https://wa.me/${store.whatsapp}`, '_blank')}
                            className="bg-green-500 hover:bg-green-400 text-white text-[9px] font-black px-4 py-2 rounded-full uppercase shadow-lg transition-colors mt-3"
                          >
                            <i className="fab fa-whatsapp mr-1"></i> Negociar
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.rows.map((row, idx) => (
                    <tr key={row.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} border-b border-gray-100 last:border-0 hover:bg-orange-50/20 transition-colors`}>
                      <td className="sticky left-0 z-20 p-8 bg-inherit border-r border-gray-100 shadow-[4px_0_15px_rgba(0,0,0,0.03)]">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-800 uppercase leading-tight">{row.name}</span>
                          <span className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-tighter">Qtd: {row.quantity} {row.unit}</span>
                        </div>
                      </td>
                      {matrixData.stores.map(store => {
                        const cell = row.storePrices[store.id];
                        return (
                          <td key={store.id} className="p-6 text-center border-r border-gray-50 last:border-0">
                            {cell ? (
                              <div className={`inline-block px-4 py-3 rounded-2xl transition-transform hover:scale-105 ${cell.isBest ? 'bg-green-50 text-green-700 ring-2 ring-green-100 shadow-sm' : ''}`}>
                                <p className="text-sm font-black">R$ {cell.price.toFixed(2).replace('.', ',')}</p>
                                {cell.isBest && <span className="text-[7px] font-black uppercase block mt-1 tracking-widest">Melhor Opção</span>}
                              </div>
                            ) : <span className="text-[10px] font-black text-gray-200 uppercase">Não possui</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-900">
                    <td className="sticky left-0 z-20 bg-slate-50 p-8 border-r border-gray-200 shadow-[4px_0_15px_rgba(0,0,0,0.03)]">
                      <span className="text-[10px] font-black uppercase text-slate-400">Total desta Loja</span>
                    </td>
                    {matrixData.stores.map(store => (
                      <td key={store.id} className="p-8 text-center border-r border-gray-100 last:border-0">
                        <div className="flex flex-col items-center">
                          <div className={`text-xl font-black text-slate-900`}>
                            <span className="text-[10px] mr-1 text-slate-400">R$</span>
                            {store.totalPrice.toFixed(2).replace('.', ',')}
                          </div>
                          <span className="text-[8px] font-bold text-gray-400 uppercase mt-1 tracking-tighter">{store.itemsCount} de {matrixData.rows.length} itens encontrados</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : hasSearched ? (
          <div className="py-32 text-center bg-white rounded-[4rem] shadow-sm border border-gray-100 max-w-2xl mx-auto px-6">
             <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fas fa-search-location text-3xl text-gray-200"></i>
             </div>
             <p className="text-slate-800 font-black uppercase text-sm tracking-tight">Nenhuma loja num raio de 50km</p>
             <p className="text-gray-400 font-bold uppercase text-[10px] mt-2 tracking-widest">Não encontramos parceiros ativos na sua região em um raio de 50km.</p>
          </div>
        ) : (
          <div className="py-32 text-center bg-white rounded-[4rem] shadow-sm border border-gray-100 max-w-2xl mx-auto px-6">
             <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fas fa-search text-3xl text-gray-200"></i>
             </div>
             <p className="text-slate-800 font-black uppercase text-sm tracking-tight">Matriz de Preços</p>
             <p className="text-gray-400 font-bold uppercase text-[10px] mt-2 tracking-widest">Compare preços entre as 3 melhores lojas num raio de 50km.</p>
          </div>
        )}
      </div>
    </div>
  );
};
