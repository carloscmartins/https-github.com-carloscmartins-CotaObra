
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Store, MasterMaterial } from '../types';
import { getProducts, calculateDistance, parseLocation, supabase } from '../supabase';

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

const LOADING_STEPS = [
  "Rastreando lojas no seu raio...",
  "Consultando tabelas de preços...",
  "Calculando rotas de entrega...",
  "Verificando disponibilidade de estoque...",
  "Otimizando seu orçamento ASAP..."
];

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
  const [viewMode, setViewMode] = useState<'catalog' | 'select_stores' | 'search'>('catalog');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number}>({ lat: -23.5222, lng: -46.7327 });
  const [userAddress, setUserAddress] = useState<string | null>("Vila Leopoldina, SP");
  const [locSource, setLocSource] = useState<'GPS' | 'Rede' | 'Manual' | 'Padrão'>('Padrão');
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [searchRadius, setSearchRadius] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [nearbyStores, setNearbyStores] = useState<any[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [realResults, setRealResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [selectedMaterials, setSelectedMaterials] = useState<MasterMaterial[]>(preSelected);
  const [masterCatalog, setMasterCatalog] = useState<MasterMaterial[]>([]);
  const [activeCatalogCategory, setActiveCatalogCategory] = useState<string | null>(null);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [hoveredStoreMap, setHoveredStoreMap] = useState<string | null>(null);

  useEffect(() => {
    if (preSelected && preSelected.length > 0) {
      setSelectedMaterials(preSelected);
    }
  }, [preSelected]);

  const fetchLocationByIP = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data && data.latitude) {
        const coords = { lat: data.latitude, lng: data.longitude };
        setUserLocation(coords);
        setLocSource('Rede');
        setUserAddress(`${data.city || 'Sua Cidade'}, ${data.region || 'Brasil'}`);
        return coords;
      }
    } catch (e) {
      console.warn("IP-API falhou");
    }
    return userLocation;
  };

  const handleManualAddressSearch = async () => {
    if (!addressInput.trim()) return;
    setLoadingAddress(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressInput)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const result = data[0];
        const coords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
        setUserLocation(coords);
        setUserAddress(result.display_name.split(',')[0] + (result.display_name.split(',')[1] ? ', ' + result.display_name.split(',')[1] : ''));
        setLocSource('Manual');
        setIsEditingAddress(false);
      } else {
        alert("Local não encontrado. Tente digitar Cidade e Estado.");
      }
    } catch (e) {
      alert("Erro ao buscar endereço.");
    } finally {
      setLoadingAddress(false);
    }
  };

  const getPreciseLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(coords);
          setLocSource('GPS');
          fetchUserAddress(coords);
        },
        async (err) => {
          await fetchLocationByIP();
        },
        { enableHighAccuracy: false, timeout: 1500, maximumAge: Infinity }
      );
    } else {
      fetchLocationByIP();
    }
  };

  useEffect(() => {
    fetchMasterCatalog();
    getPreciseLocation();
  }, []);

  const fetchUserAddress = async (coords = userLocation) => {
    if (!coords || loadingAddress) return;
    setLoadingAddress(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}`, {
        headers: { 'Accept-Language': 'pt-BR' }
      });
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const street = addr.road || addr.pedestrian || addr.suburb || "Local identificado";
        const city = addr.city || addr.town || addr.village || "";
        setUserAddress(`${street}${city ? ', ' + city : ''}`);
      }
    } catch (e) {
      console.error("Erro reverse geocode");
    } finally {
      setLoadingAddress(false);
    }
  };

  // Mantém a distância das lojas atualizada se a localização mudar
  useEffect(() => {
    if (userLocation && nearbyStores.length > 0) {
      setNearbyStores(prevStores => 
        prevStores.map(store => {
          const storeCoords = store.coords || parseLocation(store.location);
          if (storeCoords) {
            const d = calculateDistance(userLocation.lat, userLocation.lng, storeCoords.lat, storeCoords.lng);
            return { ...store, distance: d, coords: storeCoords };
          }
          return store;
        })
      );
    }
  }, [userLocation]);

  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 1800);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const fetchMasterCatalog = async () => {
    const { data } = await supabase
      .from('materiais')
      .select('*')
      .eq('ativo', true)
      .order('nome', { ascending: true });
    
    if (data) {
      setMasterCatalog(data);
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

  const clearSelection = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedMaterials([]);
    setSelectedStoreIds([]);
    setHasSearched(false);
    setShowCartDrawer(false);
    setActiveCatalogCategory(null);
    setRealResults([]);
    setViewMode('catalog');
  };

  const formatDist = (dist: number | undefined | null) => {
    if (dist === undefined || dist === null || isNaN(dist)) return "Calculando...";
    if (dist < 0.05) return "No Local";
    return dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)} KM`;
  };

  const handleStartQuotation = async () => {
    if (selectedMaterials.length === 0) return;
    setLoading(true);
    try {
      const { data: storesData } = await supabase.from('stores').select('*');
      if (!storesData) {
        setNearbyStores([]);
        setViewMode('select_stores');
        return;
      }

      const processedStores = storesData.map(s => {
        const coords = parseLocation(s.location);
        let dist = null;
        if (userLocation && coords) {
          dist = calculateDistance(userLocation.lat, userLocation.lng, coords.lat, coords.lng);
        }
        return { ...s, distance: dist, coords };
      });

      // FILTRAGEM PELO RAIO DE BUSCA
      const filteredByRadius = processedStores.filter(s => {
        if (s.distance === null) return false;
        return s.distance <= searchRadius;
      });

      const sorted = filteredByRadius.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
      setNearbyStores(sorted);
      setViewMode('select_stores');
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const toggleStoreSelection = (id: string) => {
    setSelectedStoreIds(prev => {
      const idLower = String(id).toLowerCase();
      if (prev.includes(idLower)) return prev.filter(sid => sid !== idLower);
      if (prev.length >= 5) return prev;
      return [...prev, idLower];
    });
  };

  const handleFinalQuotation = async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const ids = selectedMaterials.map(m => Number(m.id));
      // Aqui o getProducts também respeita o searchRadius internamente
      const data = await getProducts(undefined, ids, undefined, 5, userLocation, searchRadius);
      setRealResults(data);
      await new Promise(r => setTimeout(r, 1000));
      setViewMode('search');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const matrixData = useMemo(() => {
    if (!hasSearched) return { stores: [], rows: [] };
    const stores = nearbyStores
      .filter(s => selectedStoreIds.includes(String(s.id).toLowerCase()))
      .map(s => ({
        id: String(s.id).toLowerCase(),
        name: s.name,
        whatsapp: s.whatsapp,
        distance: s.distance,
        coords: s.coords,
        address: s.address,
        totalPrice: 0,
        itemsCount: 0
      }));
    const rows = selectedMaterials.map(mat => {
      const mid = Number(mat.id);
      const samples = realResults.filter(r => Number(r.material_id) === mid);
      const aiSug = aiSuggestions.find(s => Number(s.materialId) === mid);
      const qty = Number(aiSug?.quantity || 1);
      const storePrices: Record<string, { price: number, isBest: boolean }> = {};
      let minPrice = Infinity;
      stores.forEach(store => {
        const match = samples.find(s => String(s.store_id || '').trim().toLowerCase() === store.id);
        if (match && typeof match.price === 'number') {
          storePrices[store.id] = { price: match.price, isBest: false };
          if (match.price < minPrice) minPrice = match.price;
          store.totalPrice += (match.price * qty);
          store.itemsCount++;
        }
      });
      Object.keys(storePrices).forEach(sid => {
        if (storePrices[sid].price === minPrice && minPrice !== Infinity) storePrices[sid].isBest = true;
      });
      return { id: mid, name: mat.nome, unit: mat.unidade, quantity: qty.toString(), storePrices };
    });
    return { stores, rows };
  }, [realResults, aiSuggestions, hasSearched, selectedMaterials, selectedStoreIds, nearbyStores]);

  const sendWhatsAppOrder = (store: any) => {
    const storeId = store.id;
    const allRows = matrixData.rows;
    const FINAL_WHATSAPP = store.whatsapp || '5511961553359';
    let message = `👷‍♂️🏗️ *SOLICITAÇÃO DE COTAÇÃO*\n➖➖➖➖➖➖➖➖➖➖➖➖\n⚡ *ASAPOBRA* - _As Soon As Possible_\n➖➖➖➖➖➖➖➖➖➖➖➖\n\n🏪 *Loja:* ${store.name.toUpperCase()}\n📅 *Data:* ${new Date().toLocaleDateString('pt-BR')}\n\nOlá! Gostaria de uma cotação para os seguintes itens:\n\n`;
    let totalEstimado = 0;
    allRows.forEach((row, index) => {
      const info = row.storePrices[storeId];
      const qty = Number(row.quantity);
      message += `${index + 1}. *${row.name}*\n   🔸 Quantidade: *${row.quantity} ${row.unit}*\n`;
      if (info) {
        const subtotal = info.price * qty;
        totalEstimado += subtotal;
        message += `   💰 Ref: R$ ${info.price.toFixed(2).replace('.', ',')} (Sub: R$ ${subtotal.toFixed(2).replace('.', ',')})\n\n`;
      } else { message += `   ⚠️ _[ITEM SEM PREÇO - POR FAVOR COTAR]_\n\n`; }
    });
    message += `➖➖➖➖➖➖➖➖➖➖➖➖\n`;
    if (totalEstimado > 0) message += `💵 *TOTAL ESTIMADO: R$ ${totalEstimado.toFixed(2).replace('.', ',')}*\n`;
    message += `➖➖➖➖➖➖➖➖➖➖➖➖\n\n_Enviado via App ASAPOBRA_\n👷‍♂️ *Obrigado e aguardo retorno!*`;
    window.open(`https://wa.me/${FINAL_WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="p-4 space-y-6 max-w-full mx-auto pb-64 bg-gray-50/50 min-h-screen relative">
      {loading && (
        <div className="fixed inset-0 z-[200] bg-white/80 backdrop-blur-xl flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
           <div className="w-32 h-32 bg-orange-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse mb-8">
              <i className="fas fa-search-location text-white text-4xl"></i>
           </div>
           <h3 className="text-slate-900 font-black uppercase text-sm tracking-widest italic">{LOADING_STEPS[loadingStep]}</h3>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white px-6 py-4 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-6">
            <div className="flex items-center text-left gap-4 shrink-0 p-2 w-full md:w-auto">
                <button 
                  onClick={() => setIsEditingAddress(!isEditingAddress)}
                  className={`w-12 h-12 ${locSource === 'GPS' ? 'bg-green-50 text-green-600' : locSource === 'Manual' ? 'bg-orange-600 text-white' : 'bg-blue-50 text-blue-600'} rounded-2xl flex items-center justify-center shadow-inner shrink-0 active:scale-95 transition-all`}
                >
                    <i className={`fas ${loadingAddress ? 'fa-circle-notch fa-spin' : isEditingAddress ? 'fa-times' : locSource === 'GPS' ? 'fa-location-dot' : 'fa-map-marked-alt'}`}></i>
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest leading-none mb-1">
                      {isEditingAddress ? 'Onde é a obra?' : `Local (${locSource})`}
                    </p>
                    {isEditingAddress ? (
                      <div className="flex gap-2">
                        <input 
                          autoFocus
                          className="bg-gray-50 border-b-2 border-orange-500 font-bold text-xs p-1 outline-none w-full"
                          placeholder="Cidade, Rua ou Bairro..."
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleManualAddressSearch()}
                        />
                        <button onClick={handleManualAddressSearch} className="text-orange-600 font-black text-[10px] uppercase">Ok</button>
                      </div>
                    ) : (
                      <button onClick={() => setIsEditingAddress(true)} className="text-[11px] font-bold text-slate-800 uppercase line-clamp-1 leading-tight hover:text-orange-600 transition-colors">
                        {userAddress} <i className="fas fa-pencil text-[8px] ml-1 opacity-30"></i>
                      </button>
                    )}
                </div>
            </div>
            <div className="flex-1 w-full border-l border-gray-100 pl-6">
                <div className="flex justify-between items-center mb-2 px-1">
                    <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest leading-none">Raio de busca</p>
                    <span className="bg-slate-900 text-white px-3 py-0.5 rounded-full text-[9px] font-black italic">{searchRadius} KM</span>
                </div>
                <input type="range" min="5" max="100" step="5" value={searchRadius} onChange={(e) => setSearchRadius(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600" />
            </div>
        </div>

        {viewMode === 'catalog' ? (
          <div className="space-y-6 animate-in slide-in-from-bottom-6 max-w-4xl mx-auto">
            {!activeCatalogCategory ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCatalogCategory(cat)} className="bg-white p-10 rounded-[3rem] border border-gray-100 text-center hover:border-orange-400 transition-all group flex flex-col items-center gap-5">
                    <div className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.default} shadow-sm group-hover:scale-110 transition-transform`}>
                      <i className={`fas ${CATEGORY_ICONS[cat] || 'fa-box'} text-2xl`}></i>
                    </div>
                    <span className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-tight">{cat}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between px-2">
                  <button onClick={() => setActiveCatalogCategory(null)} className="bg-white text-slate-900 text-[10px] font-black uppercase flex items-center gap-2 px-6 py-4 rounded-[2rem] hover:bg-gray-50 shadow-sm border border-gray-100">
                    <i className="fas fa-arrow-left text-orange-600"></i> Voltar
                  </button>
                  <span className="text-[10px] font-black uppercase text-slate-900 italic tracking-widest bg-orange-50 px-4 py-2 rounded-full">{activeCatalogCategory}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {masterCatalog.filter(m => m.categoria === activeCatalogCategory).map(m => {
                    const isSelected = selectedMaterials.find(sm => sm.id === m.id);
                    return (
                      <button key={m.id} onClick={() => toggleMaterialSelection(m)} className={`p-6 rounded-[2.5rem] border text-left transition-all flex items-center gap-5 relative ${isSelected ? 'bg-orange-600 border-orange-600 text-white shadow-xl scale-[1.02]' : 'bg-white border-gray-100 text-slate-800 hover:border-orange-300'}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isSelected ? 'bg-white/20' : 'bg-gray-50 text-gray-400'}`}>
                          <i className={`fas ${CATEGORY_ICONS[m.categoria] || 'fa-box'} text-xl`}></i>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-black uppercase leading-tight">{m.nome}</p>
                          <p className={`text-[9px] font-bold uppercase mt-1 ${isSelected ? 'text-orange-100' : 'text-gray-400'}`}>{m.unidade}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'select_stores' ? (
          <div className="space-y-8 animate-in slide-in-from-bottom-8 max-w-4xl mx-auto">
            <button onClick={() => setViewMode('catalog')} className="text-slate-900 font-black uppercase text-[10px] tracking-widest flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
              <i className="fas fa-chevron-left"></i> Adicionar Mais Itens
            </button>
            <div className="text-center space-y-2">
                <h3 className="text-slate-900 font-black uppercase text-sm italic">Lojas em um raio de {searchRadius}km</h3>
                <p className="text-gray-400 font-bold uppercase text-[9px] tracking-widest italic">Escolha até 5 para o comparativo</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {nearbyStores.length > 0 ? nearbyStores.map(store => {
                const sid = String(store.id).toLowerCase();
                const isSelected = selectedStoreIds.includes(sid);
                const isFull = !isSelected && selectedStoreIds.length >= 5;
                return (
                  <button key={store.id} disabled={isFull} onClick={() => toggleStoreSelection(sid)} className={`p-6 rounded-[3rem] border-0 transition-all relative flex flex-col items-center gap-4 shadow-sm hover:shadow-xl ${isSelected ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'} ${isFull ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}>
                    <p className="text-[10px] font-black uppercase tracking-tight text-center leading-tight mb-2 min-h-[2.5rem] flex items-center">{store.name}</p>
                    <div className={`${isSelected ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-600'} px-6 py-2 rounded-full mb-2 flex items-center gap-2 shadow-inner`}>
                       <span className="font-black text-xs italic">{formatDist(store.distance)}</span>
                    </div>
                  </button>
                );
              }) : (
                <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border border-dashed border-gray-200 px-10">
                  <i className="fas fa-satellite-dish text-gray-200 text-4xl mb-4"></i>
                  <p className="text-gray-400 font-black uppercase text-[10px] tracking-widest leading-relaxed mb-6">Nenhuma loja encontrada em {searchRadius}KM.</p>
                  <button onClick={() => setViewMode('catalog')} className="text-orange-600 font-black uppercase text-[10px] border-b-2 border-orange-600 pb-1">Tente aumentar o raio acima</button>
                </div>
              )}
            </div>
            {selectedStoreIds.length > 0 && (
              <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-[110]">
                <button onClick={handleFinalQuotation} className="w-full bg-orange-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all">COMPARAR PREÇOS</button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full space-y-8">
            <div className="flex justify-between items-center px-4">
                <button onClick={() => setViewMode('select_stores')} className="text-slate-900 font-black uppercase text-[10px] bg-white px-5 py-3 rounded-full border border-gray-100 shadow-sm active:scale-95">
                  <i className="fas fa-chevron-left text-orange-600 mr-2"></i> Lojas
                </button>
                <p className="text-[10px] font-black uppercase text-gray-400 italic">ASAP ⚡</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {matrixData.stores.map((store) => (
                  <div key={store.id} className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden flex flex-col group transition-all">
                    <div className="bg-slate-900 p-8 text-center text-white">
                      <h4 className="text-[11px] font-black uppercase leading-tight min-h-[2.5rem] flex items-center justify-center">{store.name}</h4>
                      <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 bg-orange-600/20 border border-orange-600/30 rounded-full">
                         <span className="text-orange-500 text-[10px] font-black italic">{formatDist(store.distance)}</span>
                      </div>
                      <button onClick={() => sendWhatsAppOrder(store)} className="w-full bg-white text-slate-900 py-4 rounded-2xl text-[10px] font-black uppercase mt-6 flex items-center justify-center gap-2">
                        <i className="fab fa-whatsapp text-green-500 text-lg"></i> Abrir Zap
                      </button>
                    </div>
                    <div className="flex-1 p-5 space-y-4 bg-gray-50/30">
                      {matrixData.rows.map(row => {
                        const cell = row.storePrices[store.id];
                        return (
                          <div key={row.id} className={`p-4 rounded-[2rem] border transition-all ${cell?.isBest ? 'border-orange-400 bg-orange-50/50 ring-1 ring-orange-200' : 'border-gray-50 bg-white shadow-sm'}`}>
                            <p className="text-[10px] font-black text-slate-800 uppercase line-clamp-2 mb-2">{row.name}</p>
                            <div className="flex justify-between items-baseline">
                              <span className="text-[9px] font-bold text-gray-400 uppercase italic">{row.quantity} {row.unit}</span>
                              <span className={`text-[12px] font-black italic ${cell ? 'text-slate-900' : 'text-gray-200'}`}>{cell ? `R$ ${cell.price.toFixed(2).replace('.', ',')}` : '---'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-8 bg-slate-50 border-t border-gray-100 text-center">
                       <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total</p>
                       <p className="text-2xl font-black text-slate-900 italic">R$ {(store.totalPrice || 0).toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {selectedMaterials.length > 0 && viewMode === 'catalog' && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-white p-3 rounded-[3.5rem] shadow-2xl flex items-center gap-3 border border-orange-100 w-[95%] max-w-xl">
            <button onClick={() => setShowCartDrawer(true)} className="flex items-center gap-4 bg-orange-50 px-6 py-4 rounded-[2.5rem] flex-1">
              <div className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center text-white"><i className="fas fa-shopping-basket"></i></div>
              <div className="text-left">
                <p className="text-[11px] font-black uppercase text-slate-900">{selectedMaterials.length} ITENS</p>
                <p className="text-[8px] font-bold uppercase text-orange-600 tracking-widest mt-1 italic">Ver Minha Lista</p>
              </div>
            </button>
            <button onClick={handleStartQuotation} className="bg-slate-900 text-white px-10 h-16 rounded-full font-black uppercase text-[11px] tracking-widest flex items-center justify-center min-w-[160px]">COTAR AGORA</button>
          </div>
        )}

        {showCartDrawer && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-end justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-10 shadow-2xl">
               <div className="flex justify-between items-center mb-8">
                  <h4 className="text-xs font-black uppercase text-orange-600">Sua Cotação ({selectedMaterials.length})</h4>
                  <button onClick={() => setShowCartDrawer(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-400"><i className="fas fa-times"></i></button>
               </div>
               <div className="space-y-3 max-h-[45vh] overflow-y-auto no-scrollbar mb-10 p-2">
                  {selectedMaterials.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-6 bg-gray-50 rounded-[2.2rem] border border-gray-100">
                       <span className="text-[11px] font-black uppercase text-slate-800">{m.nome}</span>
                       <button onClick={() => toggleMaterialSelection(m)} className="text-red-300 hover:text-red-500"><i className="fas fa-trash-alt"></i></button>
                    </div>
                  ))}
               </div>
               <button onClick={handleStartQuotation} className="w-full py-6 bg-orange-600 text-white rounded-[2.5rem] font-black uppercase text-xs">Procurar Lojas</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
