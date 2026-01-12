
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Store, MasterMaterial } from '../types';
import { getProducts, supabase } from '../supabase';

const DEFAULT_COORDS = { lat: -23.55052, lng: -46.633308 }; // São Paulo
const MAX_ITEMS = 10;

export const ConstructorView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [allMasterMaterials, setAllMasterMaterials] = useState<MasterMaterial[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategoryModal, setActiveCategoryModal] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<MasterMaterial[]>([]);
  
  const [hasSearched, setHasSearched] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchRadius, setSearchRadius] = useState(50); 
  const [loading, setLoading] = useState(false);
  const [realResults, setRealResults] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  const [limitError, setLimitError] = useState(false);

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const { data, error } = await supabase
          .from('materiais')
          .select('*')
          .eq('ativo', true)
          .order('nome', { ascending: true });
        
        if (!error && data) {
          setAllMasterMaterials(data);
          const uniqueCats = Array.from(new Set(data.map((i: any) => i.categoria)))
            .filter(Boolean)
            .sort() as string[];
          setCategories(uniqueCats);
        }
      } catch (err) {
        console.error("Erro ao carregar dados mestres:", err);
      }
    };
    fetchMasterData();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
        },
        () => setUserCoords(DEFAULT_COORDS),
        { timeout: 8000, enableHighAccuracy: true }
      );
    } else {
      setUserCoords(DEFAULT_COORDS);
    }
  }, []);

  const handleSearch = async (materialsOverride?: MasterMaterial[]) => {
    const currentMaterials = materialsOverride || selectedMaterials;
    const term = searchTerm.trim();

    if (currentMaterials.length === 0 && term === '') {
      setRealResults([]);
      setHasSearched(false);
      return;
    }
    
    setLoading(true);
    setHasSearched(true);
    const coords = userCoords || DEFAULT_COORDS;

    try {
      const materialIds = currentMaterials.map(m => Number(m.id));
      const data = await getProducts(searchRadius, coords.lat, coords.lng, term, materialIds);
      setRealResults(data || []);
    } catch (err) {
      console.error(err);
      setRealResults([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleMaterialSelection = (mat: MasterMaterial) => {
    setLimitError(false);
    setSelectedMaterials(prev => {
      const isSelected = prev.find(m => m.id === mat.id);
      let next;
      if (isSelected) {
        next = prev.filter(m => m.id !== mat.id);
      } else {
        if (prev.length >= MAX_ITEMS) {
          setLimitError(true);
          return prev;
        }
        next = [...prev, mat];
      }

      if (next.length > 0) {
        setSearchTerm(next[next.length - 1].nome);
      } else {
        setSearchTerm('');
      }
      
      return next;
    });
  };

  const matrixData = useMemo(() => {
    const storesMap = new Map();
    const materialsMap = new Map();

    if (selectedMaterials.length > 0) {
      selectedMaterials.forEach(m => {
        materialsMap.set(m.nome, {
          id: m.id,
          name: m.nome,
          category: m.categoria,
          unidade: m.unidade || 'UN',
          prices: {} 
        });
      });
    }

    realResults.forEach(item => {
      const storeId = item.store_id;
      if (!storesMap.has(storeId)) {
        storesMap.set(storeId, {
          id: storeId,
          name: item.store_name,
          whatsapp: item.whatsapp,
          distance: item.distance_km,
          address: item.address
        });
      }

      const targetMat = selectedMaterials.find(m => 
        (item.material_id && Number(m.id) === Number(item.material_id)) ||
        item.name.toLowerCase().includes(m.nome.toLowerCase())
      );

      let rowKey = targetMat ? targetMat.nome : item.name;

      if (!materialsMap.has(rowKey)) {
        if (materialsMap.size < MAX_ITEMS) {
          materialsMap.set(rowKey, {
            id: item.material_id,
            name: item.name,
            category: item.category,
            unidade: item.metadata?.unit || 'UN',
            prices: {}
          });
        } else {
          return;
        }
      }

      const matEntry = materialsMap.get(rowKey);
      if (matEntry && (!matEntry.prices[storeId] || item.price < matEntry.prices[storeId])) {
        matEntry.prices[storeId] = item.price;
      }
    });

    const sortedStores = Array.from(storesMap.values()).sort((a, b) => (a.distance || 0) - (b.distance || 0));

    return {
      stores: sortedStores,
      top3: sortedStores.slice(0, 3),
      materials: Array.from(materialsMap.values())
    };
  }, [realResults, selectedMaterials]);

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto pb-24">
      {limitError && (
        <div className="bg-red-500 text-white p-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center animate-bounce shadow-lg">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          Limite máximo de {MAX_ITEMS} itens atingido!
        </div>
      )}

      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-orange-50 space-y-6">
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-3 bg-gray-50 px-5 py-4 rounded-2xl border border-gray-100 focus-within:border-orange-500 shadow-inner transition-all">
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-search'} text-orange-400`}></i>
              <input 
                className="bg-transparent outline-none w-full font-semibold text-gray-700"
                placeholder="O que você precisa hoje?"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button 
              disabled={loading}
              onClick={() => handleSearch()} 
              className="bg-orange-600 text-white px-8 rounded-2xl hover:bg-orange-700 shadow-lg font-black uppercase text-xs disabled:opacity-50 active:scale-95 transition-all"
            >
              Cotar
            </button>
          </div>

          <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Raio de busca: <span className="text-orange-600 font-black">{searchRadius} KM</span></span>
                <span className="text-[8px] font-bold text-gray-300 uppercase">Apenas lojas nesse raio</span>
             </div>
             <input 
               type="range" 
               min="1" 
               max="100" 
               step="1"
               value={searchRadius} 
               onChange={(e) => setSearchRadius(Number(e.target.value))}
               onMouseUp={() => hasSearched && handleSearch()}
               onTouchEnd={() => hasSearched && handleSearch()}
               className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
             />
          </div>

          <div className="px-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="fas fa-location-dot text-orange-600 animate-pulse"></i>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                Sua posição: <span className="text-slate-900 font-bold">{userCoords ? 'GPS Ativo' : 'Aguardando...'}</span>
              </span>
            </div>
            {matrixData.top3.length > 0 && (
              <div className="flex gap-3">
                {matrixData.top3.map((s, idx) => (
                   <div key={s.id} className="flex flex-col items-end">
                      <span className="text-[8px] font-black text-slate-800 uppercase">{idx+1}ª {s.name.split(' ')[0]}</span>
                      <span className="text-[8px] font-bold text-orange-500">{s.distance.toFixed(1)} km</span>
                   </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Categorias em Destaque</h4>
          </div>
          <div className="flex flex-wrap gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategoryModal(cat)}
                className="whitespace-nowrap px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider bg-white border border-gray-100 text-gray-500 hover:border-orange-400 transition-all hover:bg-orange-50"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {selectedMaterials.length > 0 && (
          <div className="pt-4 border-t border-gray-50 flex flex-wrap gap-2 animate-in fade-in">
            {selectedMaterials.map(mat => (
              <div key={mat.id} className="bg-slate-900 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
                <span className="text-[9px] font-black text-white uppercase">{mat.nome}</span>
                <button onClick={() => {
                  const next = selectedMaterials.filter(m => m.id !== mat.id);
                  setSelectedMaterials(next);
                  setLimitError(false);
                  if (next.length === 0) {
                    setSearchTerm('');
                    setRealResults([]);
                    setHasSearched(false);
                  }
                }} className="text-white/40 hover:text-white">
                  <i className="fas fa-times-circle"></i>
                </button>
              </div>
            ))}
            <button onClick={() => { setSelectedMaterials([]); setRealResults([]); setHasSearched(false); setSearchTerm(''); setLimitError(false); }} className="text-[9px] font-black text-orange-600 uppercase ml-2 hover:underline">Limpar Tudo</button>
          </div>
        )}
      </div>

      <div className="mt-8 bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-24 text-center flex flex-col items-center gap-4">
             <i className="fas fa-circle-notch fa-spin text-orange-500 text-4xl"></i>
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Processando cotação regional...</p>
          </div>
        ) : matrixData.stores.length > 0 ? (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="p-6 sticky left-0 bg-white z-20 border-b border-gray-100 min-w-[220px]">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Material</span>
                  </th>
                  {matrixData.stores.map(store => (
                    <th key={store.id} className="p-6 border-b border-gray-100 min-w-[180px] cursor-pointer hover:bg-orange-50 transition-colors" onClick={() => setSelectedStore(store)}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.4)] bg-green-500`}></div>
                        <span className="text-[11px] font-black text-gray-900 uppercase block truncate">{store.name}</span>
                      </div>
                      {store.distance !== undefined && <span className="text-[9px] font-bold text-orange-600">{store.distance.toFixed(1)} km</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {matrixData.materials.map(mat => (
                  <tr key={mat.name} className="hover:bg-gray-50/30 group transition-colors">
                    <td className="p-6 sticky left-0 bg-white z-10 border-r border-gray-50 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                      <span className="text-xs font-bold text-gray-800 block leading-tight">{mat.name}</span>
                      <span className="text-[8px] font-black text-orange-500 uppercase bg-orange-50 px-2 py-0.5 rounded mt-2 inline-block">{mat.unidade}</span>
                    </td>
                    {matrixData.stores.map(store => {
                      const price = mat.prices[store.id];
                      return (
                        <td key={`${mat.name}-${store.id}`} className="p-6">
                          {price ? (
                            <div className="animate-in zoom-in-95 duration-300">
                              <div className="text-sm font-mono font-black text-slate-900">R$ {price.toFixed(2).replace('.', ',')}</div>
                              <button 
                                onClick={() => window.open(`https://wa.me/${store.whatsapp}?text=Olá! Quero cotar "${mat.name}" por R$ ${price.toFixed(2)}.`, '_blank')}
                                className="mt-2 text-[8px] font-black text-green-500 uppercase flex items-center gap-1 hover:bg-green-50 px-2 py-1 rounded-lg transition-colors"
                              >
                                <i className="fab fa-whatsapp"></i> WhatsApp
                              </button>
                            </div>
                          ) : (
                            <div className="opacity-10 text-[8px] font-black uppercase">Não disponível</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasSearched ? (
          <div className="p-24 text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-orange-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner">
              <i className="fas fa-search-location text-orange-200 text-3xl"></i>
            </div>
            <h3 className="text-sm font-black text-gray-900 uppercase mb-2 tracking-widest">Fora de alcance ({searchRadius}km)</h3>
            <p className="text-gray-400 text-[10px] max-w-xs uppercase font-black leading-loose text-center">Nenhuma loja parceira encontrada neste raio. Aumente o raio de busca para ver resultados.</p>
          </div>
        ) : (
          <div className="p-24 text-center flex flex-col items-center">
             <i className="fas fa-arrow-up text-orange-200 text-4xl mb-6 animate-bounce"></i>
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ajuste o raio e pesquise para ver a matriz de preços</p>
          </div>
        )}
      </div>

      {activeCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden flex flex-col max-h-[80vh] shadow-2xl animate-in zoom-in-95">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase text-orange-500 leading-none">{activeCategoryModal}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Selecione até {MAX_ITEMS} itens</p>
              </div>
              <button onClick={() => { setActiveCategoryModal(null); setLimitError(false); }} className="text-white/20 hover:text-white transition-colors">
                <i className="fas fa-times-circle text-2xl"></i>
              </button>
            </div>
            <div className="p-6 overflow-y-auto no-scrollbar flex-1 space-y-2 bg-gray-50/50">
              {allMasterMaterials.filter(m => m.categoria === activeCategoryModal).map(mat => {
                const isSelected = selectedMaterials.find(s => s.id === mat.id);
                return (
                  <button 
                    key={mat.id}
                    onClick={() => toggleMaterialSelection(mat)}
                    className={`w-full p-5 rounded-2xl border text-left flex justify-between items-center transition-all ${
                      isSelected ? 'border-orange-500 bg-white shadow-lg' : 'border-white bg-white hover:border-gray-200 shadow-sm'
                    }`}
                  >
                    <div>
                      <span className={`font-black text-xs block ${isSelected ? 'text-orange-600' : 'text-slate-800'}`}>{mat.nome}</span>
                      <span className="text-[8px] font-black text-gray-300 uppercase mt-1 inline-block">{mat.unidade}</span>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                      isSelected ? 'bg-orange-600 border-orange-600 text-white' : 'border-gray-100 text-transparent'
                    }`}>
                      <i className="fas fa-check text-[10px]"></i>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-6 bg-white border-t border-gray-100 space-y-3">
              <button 
                onClick={() => { setActiveCategoryModal(null); handleSearch(); }} 
                className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-black transition-all active:scale-95"
              >
                Atualizar Cotação
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedStore && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setSelectedStore(null)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl animate-in slide-in-from-bottom-5" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-3xl flex items-center justify-center mb-6 text-2xl shadow-inner">
                <i className="fas fa-store"></i>
              </div>
              <h3 className="text-xl font-black uppercase text-slate-900 mb-2 leading-tight">{selectedStore.name}</h3>
              <p className="text-[10px] text-gray-400 font-bold mb-8 uppercase tracking-widest">{selectedStore.address}</p>
              <div className="bg-orange-50 px-4 py-2 rounded-full mb-8">
                <span className="text-[10px] font-black text-orange-600 uppercase">Distância: {selectedStore.distance.toFixed(2)} KM</span>
              </div>
              <button 
                onClick={() => window.open(`https://wa.me/${selectedStore.whatsapp}`, '_blank')}
                className="w-full bg-green-500 text-white py-5 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-3 shadow-xl hover:bg-green-600 transition-all active:scale-95 shadow-green-100"
              >
                <i className="fab fa-whatsapp text-lg"></i> Iniciar Contato
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
