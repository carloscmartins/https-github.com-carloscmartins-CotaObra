
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Store, MasterMaterial } from '../types';
import { getProducts, calculateDistance, getCategories } from '../supabase';

type SortOption = 'price' | 'distance';

const CATEGORY_ICONS: Record<string, string> = {
  'Todos': 'fa-th-large',
  'Cimento': 'fa-fill-drip',
  'Agregados': 'fa-mountain',
  'Aço': 'fa-republican',
  'Hidráulica': 'fa-faucet',
  'Elétrica': 'fa-bolt',
  'Alvenaria': 'fa-border-all',
  'Acabamento': 'fa-brush',
  'Pintura': 'fa-paint-roller',
  'Ferramentas': 'fa-tools'
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
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<MasterMaterial[]>(preSelected);
  const [excludedMaterialIds, setExcludedMaterialIds] = useState<Set<number>>(new Set());
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [loading, setLoading] = useState(false);
  const [realResults, setRealResults] = useState<any[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('price');
  const [hasSearched, setHasSearched] = useState(false);
  const [categories, setCategories] = useState<string[]>(['Todos']);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');

  useEffect(() => {
    const loadCats = async () => {
      const data = await getCategories();
      setCategories(['Todos', ...data]);
    };
    loadCats();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: -23.5505, lng: -46.6333 })
      );
    }
  }, []);

  useEffect(() => {
    if (preSelected.length > 0) {
      setSelectedMaterials(preSelected);
      setExcludedMaterialIds(new Set());
      setHasSearched(true);
      handleSearch(preSelected, activeCategory, []); 
    }
  }, [preSelected]);

  const handleSearch = async (materialsOverride?: MasterMaterial[], categoryFilter?: string, forcedTerms?: string[]) => {
    let finalTerms = [...searchTerms];
    
    // Pega o que está no input, separa por vírgula e limpa espaços
    if (searchTerm.trim()) {
      const inputTerms = searchTerm.split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0 && !finalTerms.includes(t));
      
      finalTerms = [...finalTerms, ...inputTerms];
      setSearchTerms(finalTerms);
      setSearchTerm(''); // Limpa o campo após processar os itens
    }

    // Se for uma busca disparada por clique em categoria ou remoção de chip (forcedTerms)
    if (forcedTerms !== undefined) {
      finalTerms = forcedTerms;
    }

    const cat = categoryFilter || activeCategory;
    const mats = materialsOverride || selectedMaterials;
    
    if (finalTerms.length === 0 && mats.length === 0 && (!cat || cat === 'Todos')) return;

    setLoading(true);
    setHasSearched(true);
    
    try {
      const ids = mats.length > 0 ? mats.map(m => Number(m.id)) : undefined;
      const data = await getProducts(finalTerms, ids, cat);
      setRealResults(data || []);
    } catch (err) {
      console.error(err);
      setRealResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const removeTerm = (term: string) => {
    const newTerms = searchTerms.filter(t => t !== term);
    setSearchTerms(newTerms);
    handleSearch(undefined, undefined, newTerms);
  };

  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat);
    handleSearch(undefined, cat);
  };

  const handleClear = () => {
    setSearchTerm('');
    setSearchTerms([]);
    setSelectedMaterials([]);
    setExcludedMaterialIds(new Set());
    setRealResults([]);
    setHasSearched(false);
    setActiveCategory('Todos');
  };

  const matrixData = useMemo(() => {
    if (!hasSearched) return { stores: [], rows: [] };
    const storesMap = new Map();

    realResults.forEach(item => {
      const storeIdRaw = String(item.store_id || 'unknown').trim().toLowerCase();
      if (!storesMap.has(storeIdRaw)) {
        let dist = null;
        if (userLocation && item.lat && item.lng) {
          dist = calculateDistance(userLocation.lat, userLocation.lng, Number(item.lat), Number(item.lng));
        }
        storesMap.set(storeIdRaw, {
          id: storeIdRaw,
          name: item.store_name, 
          whatsapp: item.whatsapp,
          distance: dist,
          totalPrice: 0,
          itemsCount: 0
        });
      }
    });

    const stores = Array.from(storesMap.values());
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
            store.totalPrice += match.price;
            store.itemsCount++;
          }
        });

        Object.keys(storePrices).forEach(sid => {
          if (storePrices[sid].price === minPrice) storePrices[sid].isBest = true;
        });

        return { id: mid, name: first.name, unit: (first.metadata as any)?.unit || 'UN', quantity: aiSug ? aiSug.quantity : "1", storePrices };
      });

    stores.sort((a, b) => {
      if (sortOption === 'distance') {
        return (a.distance ?? 99999) - (b.distance ?? 99999);
      }
      return a.totalPrice - b.totalPrice;
    });

    return { stores, rows };
  }, [realResults, sortOption, userLocation, aiSuggestions, hasSearched, excludedMaterialIds]);

  return (
    <div className="p-4 space-y-6 max-w-full mx-auto pb-24 bg-gray-50/50 min-h-screen">
      
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-gray-100 space-y-4">
          <div className="flex flex-col gap-3">
            {/* Chips dos materiais buscados */}
            <div className="flex flex-wrap gap-2 empty:hidden">
              {searchTerms.map(t => (
                <span key={t} className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-2 border border-orange-200 animate-in zoom-in-95 duration-200">
                  {t}
                  <button onClick={() => removeTerm(t)} className="hover:text-orange-900 transition-colors">
                    <i className="fas fa-times-circle"></i>
                  </button>
                </span>
              ))}
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-orange-500 transition-all pr-24"
                  placeholder="Ex: Cimento, Telha, Areia..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-gray-300 uppercase pointer-events-none hidden sm:block">
                  Use vírgulas
                </div>
              </div>
              <button 
                onClick={() => handleSearch()} 
                className="bg-slate-900 text-white px-5 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-transform flex items-center justify-center min-w-[60px]"
                title="Pesquisar itens"
              >
                {loading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-search"></i>}
              </button>
              {hasSearched && (
                <button onClick={handleClear} className="bg-gray-100 text-gray-500 px-5 rounded-2xl font-black uppercase text-[10px] border border-gray-200 active:scale-95 transition-transform" title="Limpar tudo">
                  <i className="fas fa-trash-alt"></i>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 pt-1 border-t border-gray-50/50">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryClick(cat)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border ${
                  activeCategory === cat 
                    ? 'bg-orange-600 text-white border-orange-600 shadow-md' 
                    : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-orange-200'
                }`}
              >
                <i className={`fas ${CATEGORY_ICONS[cat] || 'fa-box'}`}></i>
                {cat}
              </button>
            ))}
          </div>

          {hasSearched && (
            <div className="flex gap-2 items-center pt-2 border-t border-gray-50">
              <select 
                value={sortOption} 
                onChange={e => setSortOption(e.target.value as any)}
                className="flex-1 bg-gray-50 border border-gray-100 rounded-xl p-3 text-[10px] font-black uppercase text-gray-500 outline-none cursor-pointer"
              >
                <option value="price">Ordenar: Menor Preço Total</option>
                <option value="distance">Ordenar: Mais Próximas</option>
              </select>
              {userLocation && (
                <div className="px-3 py-2 bg-green-50 text-green-700 rounded-xl text-[9px] font-black uppercase border border-green-100 flex items-center gap-1">
                  <i className="fas fa-map-marker-alt"></i> GPS Ativo
                </div>
              )}
            </div>
          )}
        </div>

        {hasSearched && aiSuggestions.length > 0 && (
          <div className="bg-orange-600 text-white p-6 rounded-[2.5rem] shadow-xl">
            <div className="flex items-center justify-between border-b border-orange-500 pb-3 mb-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest">Sua Lista Técnica</h4>
              <button onClick={onOpenAIPlanner} className="text-[9px] font-black uppercase bg-white/10 px-3 py-1.5 rounded-lg">Alterar Lista</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedMaterials.map(mat => (
                <div key={mat.id} className="bg-white/10 px-3 py-1.5 rounded-full text-[9px] font-bold border border-white/10 flex items-center gap-2">
                  {mat.nome}
                  <button onClick={() => {
                    setExcludedMaterialIds(prev => {
                      const n = new Set(prev);
                      if (n.has(Number(mat.id))) n.delete(Number(mat.id)); else n.add(Number(mat.id));
                      return n;
                    });
                  }} className="text-white/40 hover:text-white">
                    <i className={`fas ${excludedMaterialIds.has(Number(mat.id)) ? 'fa-plus-circle' : 'fa-times-circle'}`}></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-7xl mx-auto mt-8">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-gray-400 uppercase">Consultando lojistas para múltiplos itens...</p>
          </div>
        ) : hasSearched ? (
          matrixData.stores.length > 0 ? (
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="sticky left-0 z-30 bg-slate-900 p-8 text-left min-w-[280px] border-r border-slate-800 shadow-[4px_0_10px_rgba(0,0,0,0.3)]">
                        <span className="text-[11px] font-black uppercase tracking-widest">Materiais</span>
                      </th>
                      {matrixData.stores.map(store => (
                        <th key={store.id} className="p-6 min-w-[200px] text-center border-r border-slate-800 last:border-0">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-black uppercase truncate w-full max-w-[180px] mb-1 text-orange-400" title={store.name}>
                              {store.name}
                            </span>
                            <div className="bg-white/10 px-3 py-1 rounded-full border border-white/5 mb-2 flex items-center gap-2">
                              <i className="fas fa-location-arrow text-[9px] text-white/50"></i>
                              <span className="text-[10px] font-black text-white uppercase">
                                {store.distance !== null ? `${store.distance.toFixed(1)} km` : '---'}
                              </span>
                            </div>
                            <button 
                              onClick={() => window.open(`https://wa.me/${store.whatsapp}`, '_blank')}
                              className="bg-green-500 hover:bg-green-400 text-white text-[9px] font-black px-4 py-2 rounded-full uppercase shadow-lg transition-colors"
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
                            <span className="text-xs font-black text-slate-800 uppercase">{row.name}</span>
                            <span className="text-[8px] font-black text-slate-400 uppercase mt-1">Qtd: {row.quantity} {row.unit}</span>
                          </div>
                        </td>
                        {matrixData.stores.map(store => {
                          const cell = row.storePrices[store.id];
                          return (
                            <td key={store.id} className="p-6 text-center border-r border-gray-50 last:border-0">
                              {cell ? (
                                <div className={`inline-block px-4 py-3 rounded-2xl transition-transform hover:scale-105 ${cell.isBest ? 'bg-green-50 text-green-700 ring-2 ring-green-100' : ''}`}>
                                  <p className="text-sm font-black">R$ {cell.price.toFixed(2).replace('.', ',')}</p>
                                  {cell.isBest && <span className="text-[7px] font-black uppercase block mt-1">Melhor Preço</span>}
                                </div>
                              ) : <span className="text-[10px] font-black text-gray-200">---</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-900">
                      <td className="sticky left-0 z-20 bg-slate-50 p-8 border-r border-gray-200 shadow-[4px_0_15px_rgba(0,0,0,0.03)]">
                        <span className="text-[10px] font-black uppercase text-slate-400">Total da Cotação</span>
                      </td>
                      {matrixData.stores.map(store => (
                        <td key={store.id} className="p-8 text-center border-r border-gray-100 last:border-0">
                          <div className="flex flex-col items-center">
                            <div className="text-xl font-black text-slate-900">
                              <span className="text-[10px] mr-1 text-slate-400">R$</span>
                              {store.totalPrice.toFixed(2).replace('.', ',')}
                            </div>
                            <span className="text-[8px] font-bold text-gray-400 uppercase mt-1">{store.itemsCount} itens</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-32 text-center bg-white rounded-[3rem] shadow-sm border border-gray-100 max-w-2xl mx-auto">
              <i className="fas fa-search-minus text-4xl text-gray-200 mb-4"></i>
              <p className="text-gray-400 font-bold uppercase text-xs">Nenhum produto encontrado para estes termos.</p>
              <button onClick={handleClear} className="mt-6 text-orange-600 font-black uppercase text-[10px]">Tentar nova busca</button>
            </div>
          )
        ) : (
          <div className="py-32 text-center flex flex-col items-center">
             <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg mb-6 text-orange-500 animate-bounce duration-[2000ms]">
                <i className="fas fa-search text-2xl"></i>
             </div>
             <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Cotação Multitermo</h2>
             <p className="text-[11px] font-black text-gray-300 uppercase mt-2">Ex: Digite "Cimento, Pedra, Telha" e clique na lupa</p>
          </div>
        )}
      </div>
    </div>
  );
};
