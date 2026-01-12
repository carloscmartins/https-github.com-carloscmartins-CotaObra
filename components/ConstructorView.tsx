
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Store, MasterMaterial } from '../types';
import { getProducts, supabase } from '../supabase';

const DEFAULT_COORDS = { lat: -23.55052, lng: -46.633308 }; // São Paulo

export const ConstructorView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [allMasterMaterials, setAllMasterMaterials] = useState<MasterMaterial[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategoryModal, setActiveCategoryModal] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<MasterMaterial[]>([]);
  
  const [hasSearched, setHasSearched] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchRadius, setSearchRadius] = useState<number>(50); 
  const [loading, setLoading] = useState(false);
  const [realResults, setRealResults] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  const [locationError, setLocationError] = useState(false);

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

    // Tentar pegar localização
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationError(false);
        },
        () => {
          setUserCoords(DEFAULT_COORDS);
          setLocationError(true);
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    } else {
      setUserCoords(DEFAULT_COORDS);
    }
  }, []);

  const handleSearch = async () => {
    const coords = userCoords || DEFAULT_COORDS;
    setLoading(true);
    setHasSearched(true);
    
    try {
      const queryTerm = searchTerm;
      const data = await getProducts(searchRadius, coords.lat, coords.lng, queryTerm);
      
      let finalData = data || [];
      
      if (selectedMaterials.length > 0) {
        const selectedIds = selectedMaterials.map(m => Number(m.id));
        const selectedNames = selectedMaterials.map(m => m.nome.toLowerCase());

        finalData = finalData.filter((p: any) => {
          const mId = p.material_id ? Number(p.material_id) : null;
          const pName = p.name ? p.name.toLowerCase() : '';
          return (mId && selectedIds.includes(mId)) || selectedNames.some(name => pName.includes(name));
        });
      }

      setRealResults(finalData);
    } catch (err) {
      console.error("Erro na busca:", err);
      setRealResults([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleMaterialSelection = (mat: MasterMaterial) => {
    setSelectedMaterials(prev => {
      const isSelected = prev.find(m => m.id === mat.id);
      if (isSelected) return prev.filter(m => m.id !== mat.id);
      return [...prev, mat];
    });
  };

  const removeMaterial = (id: number) => {
    setSelectedMaterials(prev => prev.filter(m => m.id !== id));
  };

  const matrixData = useMemo(() => {
    const storesMap = new Map();
    const materialsMap = new Map();

    if (selectedMaterials.length > 0) {
      selectedMaterials.forEach(m => {
        materialsMap.set(m.nome, {
          name: m.nome,
          category: m.categoria,
          prices: {}
        });
      });
    }

    realResults.forEach(item => {
      const storeName = item.store_name || 'Loja Desconhecida';
      const storeKey = item.store_id || storeName;
      
      if (!storesMap.has(storeKey)) {
        storesMap.set(storeKey, {
          id: item.store_id,
          name: storeName,
          whatsapp: item.whatsapp,
          distance: item.distance_km,
          address: item.address || 'Endereço não informado'
        });
      }

      let targetRowName = item.name;
      if (selectedMaterials.length > 0) {
        const match = selectedMaterials.find(m => 
          (item.material_id && Number(m.id) === Number(item.material_id)) || 
          item.name.toLowerCase().includes(m.nome.toLowerCase())
        );
        if (match) targetRowName = match.nome;
      }

      if (!materialsMap.has(targetRowName)) {
        materialsMap.set(targetRowName, {
          name: targetRowName,
          category: item.category,
          prices: {}
        });
      }
      
      const matEntry = materialsMap.get(targetRowName);
      matEntry.prices[storeName] = item.price;
    });

    return {
      stores: Array.from(storesMap.values()).sort((a, b) => (a.distance || 0) - (b.distance || 0)),
      materials: Array.from(materialsMap.values())
    };
  }, [realResults, selectedMaterials]);

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto pb-24">
      {locationError && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center gap-3 animate-pulse">
          <i className="fas fa-location-dot text-amber-600"></i>
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-tight">
            GPS Desativado. Mostrando lojas em São Paulo (Padrão).
          </p>
        </div>
      )}

      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-orange-100/50 border border-orange-50 space-y-6">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-3 bg-gray-50 px-5 py-4 rounded-2xl border border-gray-100 focus-within:border-orange-500 transition-all shadow-inner">
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-search'} text-orange-400`}></i>
            <input 
              className="bg-transparent outline-none w-full font-semibold text-gray-700 placeholder:text-gray-300"
              placeholder="Ex: Cimento, Telha, Tijolo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button 
            disabled={loading}
            onClick={handleSearch} 
            className="bg-orange-600 text-white px-8 rounded-2xl hover:bg-orange-700 active:scale-95 transition-all shadow-lg font-black uppercase text-xs tracking-widest disabled:opacity-50"
          >
            Buscar
          </button>
        </div>

        <div className="space-y-3">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categorias Rápidas</h4>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategoryModal(cat)}
                className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border bg-white border-gray-100 text-gray-500 hover:border-orange-400 hover:text-orange-600 flex items-center gap-2 shadow-sm"
              >
                {cat}
                <i className="fas fa-plus text-[8px] opacity-40"></i>
              </button>
            ))}
          </div>
        </div>

        {selectedMaterials.length > 0 && (
          <div className="pt-2 border-t border-gray-50 flex flex-wrap gap-2">
            {selectedMaterials.map(mat => (
              <div key={mat.id} className="bg-orange-600 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm animate-in zoom-in-90">
                <span className="text-[9px] font-black text-white uppercase">{mat.nome}</span>
                <button onClick={() => removeMaterial(mat.id)} className="text-white/60 hover:text-white">
                  <i className="fas fa-times-circle"></i>
                </button>
              </div>
            ))}
            <button 
              onClick={() => { setSelectedMaterials([]); setRealResults([]); setHasSearched(false); }}
              className="text-[9px] font-black text-gray-400 uppercase hover:text-red-500 px-2"
            >
              Limpar Lista
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-gray-50">
           <div className="flex justify-between mb-2">
              <span className="text-[10px] font-black text-gray-400 uppercase">Raio de Pesquisa</span>
              <span className="text-orange-600 font-black text-[10px] bg-orange-50 px-2 py-0.5 rounded-md">{searchRadius} KM</span>
           </div>
           <input 
              type="range" min="10" max="150" step="10"
              value={searchRadius} 
              onChange={e => setSearchRadius(Number(e.target.value))} 
              className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600" 
            />
        </div>
      </div>

      <div className="mt-8 bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        {!hasSearched ? (
          <div className="text-center py-24 px-10">
            <div className="bg-orange-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-clipboard-list text-3xl text-orange-200"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-tighter">Pronto para cotar?</h3>
            <p className="text-gray-400 text-[10px] mt-2 uppercase font-black tracking-widest leading-relaxed">
              Pesquise itens acima ou selecione por categoria <br/> para comparar preços em tempo real.
            </p>
          </div>
        ) : loading ? (
          <div className="p-20 text-center space-y-4">
            <i className="fas fa-circle-notch fa-spin text-orange-500 text-4xl"></i>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Varrendo lojistas na região...</p>
          </div>
        ) : matrixData.materials.length > 0 ? (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="p-6 border-b border-gray-100 sticky left-0 bg-white z-20 min-w-[240px]">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Item</span>
                  </th>
                  {matrixData.stores.map(store => (
                    <th 
                      key={store.name} 
                      className="p-6 border-b border-gray-100 min-w-[180px] group cursor-pointer hover:bg-orange-50 transition-colors" 
                      onClick={() => setSelectedStore(store)}
                    >
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-gray-900 uppercase truncate max-w-[150px] group-hover:text-orange-600">
                          {store.name}
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] font-bold text-green-600">
                            {store.distance ? `${store.distance.toFixed(1)} km` : 'Localizada'}
                          </span>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {matrixData.materials.map(mat => (
                  <tr key={mat.name} className="hover:bg-orange-50/20 transition-colors group">
                    <td className="p-6 sticky left-0 bg-white z-10 border-r border-gray-50">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-800 leading-tight">{mat.name}</span>
                        <span className="text-[8px] font-black text-orange-500 uppercase mt-1 px-1.5 py-0.5 bg-orange-50 rounded w-fit tracking-tighter">{mat.category}</span>
                      </div>
                    </td>
                    {matrixData.stores.map(store => {
                      const price = mat.prices[store.name];
                      return (
                        <td key={`${mat.name}-${store.name}`} className="p-6">
                          {price ? (
                            <div className="flex flex-col">
                              <span className="text-sm font-mono font-black text-gray-900">
                                R$ {price.toFixed(2).replace('.', ',')}
                              </span>
                              <button 
                                onClick={() => window.open(`https://wa.me/${store.whatsapp || '5511999999999'}?text=Olá, vi o preço do ${mat.name} no CotaObra e gostaria de fechar!`, '_blank')}
                                className="mt-2 text-[8px] font-black text-green-500 uppercase flex items-center gap-1"
                              >
                                <i className="fab fa-whatsapp"></i> Negociar
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-200 font-bold italic text-[10px]">Sem estoque</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-24 text-center">
            <i className="fas fa-store-slash text-gray-200 text-4xl mb-4"></i>
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma oferta no raio de {searchRadius}km.</p>
            <button onClick={() => setSearchRadius(150)} className="mt-4 text-orange-600 font-black text-[9px] uppercase underline">Aumentar raio para 150km</button>
          </div>
        )}
      </div>

      {activeCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Catálogo de</p>
                <h3 className="text-xl font-black uppercase tracking-tighter italic text-orange-500">{activeCategoryModal}</h3>
              </div>
              <button onClick={() => setActiveCategoryModal(null)} className="text-white/30 hover:text-white transition-colors">
                <i className="fas fa-times-circle text-2xl"></i>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-2 flex-1 bg-gray-50/30 no-scrollbar">
              {allMasterMaterials
                .filter(m => m.categoria === activeCategoryModal)
                .map(mat => {
                  const isSelected = selectedMaterials.find(s => s.id === mat.id);
                  return (
                    <button 
                      key={mat.id}
                      onClick={() => toggleMaterialSelection(mat)}
                      className={`w-full p-4 rounded-2xl border text-left flex justify-between items-center transition-all ${
                        isSelected ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-100' : 'border-white bg-white hover:border-orange-200 shadow-sm'
                      }`}
                    >
                      <div>
                        <h4 className="font-bold text-gray-800 text-xs">{mat.nome}</h4>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{mat.unidade || 'UN'}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center border ${isSelected ? 'bg-orange-600 border-orange-600 text-white' : 'bg-gray-100 border-gray-200 text-transparent'}`}>
                        <i className="fas fa-check text-[8px]"></i>
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="p-6 bg-white border-t border-gray-100">
              <button 
                onClick={() => setActiveCategoryModal(null)}
                className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                Pronto ({selectedMaterials.filter(m => m.categoria === activeCategoryModal).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedStore && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setSelectedStore(null)}>
          <div className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 p-8 text-white relative">
              <h3 className="text-xl font-black uppercase tracking-tighter italic leading-none">{selectedStore.name}</h3>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-widest mt-2">Dados da Loja</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 border border-gray-100">
                  <i className="fas fa-map-pin text-orange-500"></i>
                </div>
                <div>
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1 tracking-widest">Endereço</p>
                  <p className="text-xs font-bold text-gray-700">{selectedStore.address}</p>
                </div>
              </div>

              <button 
                onClick={() => window.open(`https://wa.me/${selectedStore.whatsapp || '5511999999999'}`, '_blank')}
                className="w-full bg-green-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"
              >
                <i className="fab fa-whatsapp text-lg"></i>
                Contato Direto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
