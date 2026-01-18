
import React, { useState, useEffect, useMemo } from 'react';
import { Product, MasterMaterial } from '../types';
import { supabase } from '../supabase';

const CATEGORY_UI: Record<string, { icon: string, color: string, bg: string }> = {
  'Cimento': { icon: 'fa-fill-drip', color: 'text-gray-600', bg: 'bg-gray-100' },
  'Agregados': { icon: 'fa-mountain', color: 'text-amber-700', bg: 'bg-amber-50' },
  'Aço': { icon: 'fa-republican', color: 'text-blue-700', bg: 'bg-blue-50' },
  'Hidráulica': { icon: 'fa-faucet', color: 'text-cyan-600', bg: 'bg-cyan-50' },
  'Elétrica': { icon: 'fa-bolt', color: 'text-yellow-500', bg: 'bg-yellow-50' },
  'Alvenaria': { icon: 'fa-border-all', color: 'text-orange-700', bg: 'bg-orange-50' },
  'Cobertura': { icon: 'fa-home', color: 'text-indigo-700', bg: 'bg-indigo-50' },
  'Ferramentas': { icon: 'fa-tools', color: 'text-red-600', bg: 'bg-red-50' },
  'Acabamento': { icon: 'fa-brush', color: 'text-pink-600', bg: 'bg-pink-50' },
  'default': { icon: 'fa-box', color: 'text-orange-600', bg: 'bg-orange-50' }
};

export const MerchantView: React.FC = () => {
  const [store, setStore] = useState<{ id: string, name: string, location?: string } | null>(null);
  const [availableStores, setAvailableStores] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreWhatsapp, setNewStoreWhatsapp] = useState('');
  const [tempLocation, setTempLocation] = useState<{lat: number, lng: number} | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const [view, setView] = useState<'inventory' | 'add_materials' | 'settings'>('inventory');
  const [masterCatalog, setMasterCatalog] = useState<MasterMaterial[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Product[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [selectedMaterialToAdd, setSelectedMaterialToAdd] = useState<MasterMaterial | null>(null);
  const [newMaterialPrice, setNewMaterialPrice] = useState('');

  useEffect(() => {
    const savedStore = localStorage.getItem('asapobra_store_v1');
    if (savedStore) {
      const parsedStore = JSON.parse(savedStore);
      setStore(parsedStore);
      fetchInventory(parsedStore.id);
    }
    fetchAllStores();
    fetchMasterCatalog();
  }, []);

  const fetchAllStores = async () => {
    const { data } = await supabase.from('stores').select('id, name, location').order('name');
    if (data) setAvailableStores(data);
  };

  const fetchMasterCatalog = async () => {
    try {
      const { data } = await supabase.from('materiais').select('*').eq('ativo', true).order('nome', { ascending: true });
      if (data) setMasterCatalog(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
     const uniqueCats: string[] = Array.from(new Set(masterCatalog.map((m: MasterMaterial) => m.categoria))).filter(Boolean) as string[];
     setCategories(uniqueCats.sort());
  }, [masterCatalog]);

  const fetchInventory = async (storeId: string) => {
    setLoadingInventory(true);
    try {
      const { data } = await supabase.from('products').select('*').eq('store_id', storeId).order('category', { ascending: true });
      if (data) setInventory(data.map((item: any) => ({ ...item, imageUrl: item.image_url })));
    } catch (e) { console.error(e); }
    setLoadingInventory(false);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Seu navegador não suporta geolocalização.");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTempLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGettingLocation(false);
      },
      (err) => {
        alert("Erro ao obter localização. Verifique as permissões de GPS.");
        setGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSelectStore = (selectedStore: any) => {
    localStorage.setItem('asapobra_store_v1', JSON.stringify(selectedStore));
    setStore(selectedStore);
    fetchInventory(selectedStore.id);
  };

  const handleCreateStore = async () => {
    if (!newStoreName || !newStoreWhatsapp) return;
    setIsRegistering(true);
    try {
      const newId = crypto.randomUUID();
      const cleanWhatsapp = newStoreWhatsapp.replace(/\D/g, '');
      // Usa localização do GPS se disponível, senão SP Centro
      const lat = tempLocation?.lat || -23.55052;
      const lng = tempLocation?.lng || -46.633308;
      
      const { error } = await supabase.from('stores').insert([{
        id: newId,
        name: newStoreName,
        whatsapp: cleanWhatsapp,
        address: 'Loja Cadastrada via Portal',
        delivery_radius_km: 100,
        location: `POINT(${lng} ${lat})`
      }]);
      if (error) throw error;
      handleSelectStore({ id: newId, name: newStoreName, location: `POINT(${lng} ${lat})` });
    } catch (err: any) { alert(err.message); } finally { setIsRegistering(false); }
  };

  const handleUpdateLocation = async () => {
    if (!tempLocation || !store) return;
    setIsSaving(true);
    try {
      const locationStr = `POINT(${tempLocation.lng} ${tempLocation.lat})`;
      const { error } = await supabase.from('stores').update({ location: locationStr }).eq('id', store.id);
      if (error) throw error;
      
      const updatedStore = { ...store, location: locationStr };
      setStore(updatedStore);
      localStorage.setItem('asapobra_store_v1', JSON.stringify(updatedStore));
      alert("Localização atualizada com sucesso!");
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleAddMaterial = async () => {
    if (!selectedMaterialToAdd || !newMaterialPrice || !store || isSaving) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from('products').insert([{
        name: selectedMaterialToAdd.nome,
        description: selectedMaterialToAdd.descricao || `Material ${selectedMaterialToAdd.categoria}`,
        category: selectedMaterialToAdd.categoria,
        price: parseFloat(newMaterialPrice),
        store_id: store.id,
        material_id: selectedMaterialToAdd.id,
        image_url: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=800&auto=format&fit=crop',
        active: true,
        metadata: { unit: selectedMaterialToAdd.unidade }
      }]).select();
      if (!error && data) {
        setInventory(prev => [...prev, {...data[0], imageUrl: data[0].image_url}]);
        setSelectedMaterialToAdd(null);
        setNewMaterialPrice('');
      }
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleUpdatePrice = async (id: string) => {
    const newPrice = parseFloat(editPrice);
    if (isNaN(newPrice)) return;
    try {
      const { error } = await supabase.from('products').update({ price: newPrice }).eq('id', id);
      if (!error) {
        setInventory(prev => prev.map(item => item.id === id ? { ...item, price: newPrice } : item));
        setEditingId(null);
      }
    } catch (e) { alert("Erro ao atualizar."); }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Remover este item do seu catálogo?")) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (!error) setInventory(prev => prev.filter(item => item.id !== id));
    } catch (e) { alert("Erro ao excluir."); }
  };

  const groupedInventory = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    inventory.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [inventory]);

  const filteredStores = availableStores.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!store) {
    return (
      <div className="p-6 max-w-md mx-auto min-h-screen flex flex-col justify-center animate-in fade-in duration-700">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl rotate-3 mb-6">
             <i className="fas fa-store text-orange-500 text-3xl"></i>
          </div>
          <h2 className="text-3xl font-black italic text-slate-900 uppercase tracking-tighter">Portal Lojista</h2>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Sua loja no ASAPOBRA em segundos</p>
        </div>

        <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 space-y-6">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Encontre sua Loja</label>
            <div className="relative">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-xs"></i>
              <input 
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-10 pr-4 py-4 outline-none focus:border-orange-600 font-bold text-sm shadow-inner" 
                placeholder="Ex: Depósito do Carlão" 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar">
                {filteredStores.map(s => (
                  <button key={s.id} onClick={() => handleSelectStore(s)} className="w-full text-left p-4 rounded-xl bg-gray-50 hover:bg-orange-50 hover:text-orange-600 transition-all font-bold text-sm border border-gray-100 flex justify-between items-center group">
                    {s.name}
                    <i className="fas fa-chevron-right opacity-0 group-hover:opacity-100 text-xs"></i>
                  </button>
                ))}
            </div>
          </div>

          <div className="relative py-2 flex items-center gap-4">
             <div className="flex-1 h-[1px] bg-gray-100"></div>
             <div className="text-[8px] font-black uppercase text-gray-300">ou nova loja</div>
             <div className="flex-1 h-[1px] bg-gray-100"></div>
          </div>

          <div className="space-y-4">
            <input className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none focus:border-orange-600 font-bold text-sm" placeholder="Nome da Loja" value={newStoreName} onChange={e => setNewStoreName(e.target.value)} />
            <input type="tel" className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none focus:border-orange-600 font-bold text-sm" placeholder="WhatsApp Vendas" value={newStoreWhatsapp} onChange={e => setNewStoreWhatsapp(e.target.value)} />
            
            <button 
              onClick={getCurrentLocation}
              className={`w-full py-4 rounded-2xl border-2 border-dashed font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${tempLocation ? 'border-green-500 text-green-600 bg-green-50' : 'border-gray-200 text-gray-400'}`}
            >
              {gettingLocation ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-location-crosshairs"></i>}
              {tempLocation ? 'Localização Capturada!' : 'Ativar GPS da Loja'}
            </button>

            <button disabled={!newStoreName || !newStoreWhatsapp || isRegistering} onClick={handleCreateStore} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-black active:scale-95 disabled:opacity-30 transition-all">
              {isRegistering ? 'Cadastrando...' : 'Criar Minha Loja ASAP'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto pb-32">
      <div className="bg-slate-900 rounded-[3rem] p-8 text-white shadow-xl flex justify-between items-center border-b-4 border-orange-500">
        <div>
          <h2 className="text-xl font-black italic tracking-tighter text-orange-500 uppercase leading-none">{store.name}</h2>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Painel do Lojista</p>
             {store.location && <span className="bg-green-500 w-1.5 h-1.5 rounded-full animate-pulse"></span>}
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setView('settings')} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-all">
               <i className="fas fa-cog text-white text-xs"></i>
            </button>
            <button onClick={() => { localStorage.removeItem('asapobra_store_v1'); setStore(null); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-red-500 transition-all">
               <i className="fas fa-power-off text-white text-xs"></i>
            </button>
        </div>
      </div>

      <div className="flex bg-gray-100 p-1.5 rounded-2xl gap-2 border border-gray-200">
        <button onClick={() => setView('inventory')} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'inventory' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-400'}`}>
          Meus Itens ({inventory.length})
        </button>
        <button onClick={() => setView('add_materials')} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'add_materials' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}>
          Vincular Catálogo
        </button>
      </div>

      {view === 'settings' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
           <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 italic">Configurações da Loja</h3>
              
              <div className="space-y-4">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Posição no Mapa</label>
                 <div className="p-6 bg-gray-50 rounded-[2.2rem] border border-gray-100 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-white rounded-full shadow-inner flex items-center justify-center">
                       <i className={`fas fa-map-location-dot text-2xl ${store.location ? 'text-green-500' : 'text-gray-200'}`}></i>
                    </div>
                    <p className="text-center text-[11px] font-bold text-gray-500 max-w-xs uppercase leading-relaxed tracking-tight">
                       {store.location ? 'Sua loja já tem geolocalização ativa e aparece nas buscas por raio.' : 'Sua loja ainda não tem GPS. Ative para aparecer para clientes próximos.'}
                    </p>
                    
                    <div className="w-full space-y-3">
                       <button 
                         onClick={getCurrentLocation}
                         className={`w-full py-4 rounded-2xl border-2 border-dashed font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${tempLocation ? 'border-green-500 text-green-600 bg-green-50' : 'border-gray-200 text-gray-400 hover:border-orange-200 hover:text-orange-500'}`}
                       >
                          {gettingLocation ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-location-crosshairs"></i>}
                          {tempLocation ? 'Nova Posição Capturada!' : 'Capturar GPS do Celular'}
                       </button>

                       {tempLocation && (
                         <button 
                           onClick={handleUpdateLocation}
                           disabled={isSaving}
                           className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95"
                         >
                            {isSaving ? 'Salvando...' : 'Salvar Localização'}
                         </button>
                       )}
                    </div>
                 </div>
              </div>

              <button onClick={() => setView('inventory')} className="w-full text-center py-4 text-[10px] font-black uppercase text-gray-300 hover:text-orange-600 transition-all">
                 <i className="fas fa-chevron-left mr-2"></i> Voltar para Painel
              </button>
           </div>
        </div>
      ) : view === 'inventory' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          {loadingInventory ? (
            <div className="text-center py-20"><i className="fas fa-circle-notch fa-spin text-orange-600 text-2xl"></i></div>
          ) : inventory.length > 0 ? (
            Object.entries(groupedInventory).map(([cat, items]) => (
              <div key={cat} className="space-y-4">
                <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em] px-4">{cat}</h3>
                <div className="grid grid-cols-1 gap-3">
                  {items.map(item => (
                    <div key={item.id} className="bg-white p-5 rounded-[2.2rem] border border-gray-100 shadow-sm flex flex-col gap-4 group hover:border-orange-200 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 ${CATEGORY_UI[item.category]?.bg || 'bg-gray-50'} rounded-2xl flex items-center justify-center`}>
                            <i className={`fas ${CATEGORY_UI[item.category]?.icon || 'fa-box'} ${CATEGORY_UI[item.category]?.color || 'text-gray-400'} text-xl`}></i>
                          </div>
                          <div>
                            <h4 className="font-black text-slate-800 text-xs uppercase leading-tight">{item.name}</h4>
                            <p className="text-[10px] font-bold text-orange-600 mt-0.5 italic">R$ {item.price?.toFixed(2).replace('.', ',')}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingId(item.id); setEditPrice(item.price.toString()); }} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 hover:text-orange-600 transition-all">
                            <i className="fas fa-edit text-xs"></i>
                          </button>
                          <button onClick={() => handleDeleteProduct(item.id)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-500 transition-all">
                            <i className="fas fa-trash text-xs"></i>
                          </button>
                        </div>
                      </div>
                      {editingId === item.id && (
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-50 animate-in slide-in-from-top-2">
                          <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-300 italic">R$</span>
                            <input type="number" step="0.01" className="w-full bg-gray-50 border border-orange-200 rounded-xl pl-10 pr-4 py-3 outline-none font-black text-sm" value={editPrice} autoFocus onChange={e => setEditPrice(e.target.value)} />
                          </div>
                          <button onClick={() => handleUpdatePrice(item.id)} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase">Salvar</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-[3rem] border border-dashed border-gray-100 p-12">
              <i className="fas fa-box-open text-gray-100 text-5xl mb-4"></i>
              <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest italic">Sua loja está vazia</p>
              <button onClick={() => setView('add_materials')} className="mt-6 text-orange-600 font-black text-[11px] uppercase border-b-2 border-orange-600 pb-1">Vincular Produtos</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          {!selectedCategory ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Fix: Added explicit type casting for categories as string[] and a safety check to avoid Property 'map' does not exist on type 'unknown' */}
              {Array.isArray(categories) && (categories as string[]).map((cat: string) => {
                const ui = CATEGORY_UI[cat] || CATEGORY_UI.default;
                return (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className="bg-white p-8 rounded-[2.5rem] border border-gray-100 text-center hover:border-orange-400 transition-all group flex flex-col items-center gap-4">
                    <div className={`w-14 h-14 ${ui.bg} rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                       <i className={`fas ${ui.icon} ${ui.color} text-2xl`}></i>
                    </div>
                    <span className="font-black text-[10px] text-slate-800 uppercase tracking-widest block leading-tight">{cat}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <button onClick={() => { setSelectedCategory(null); setSelectedMaterialToAdd(null); }} className="text-[10px] font-black uppercase text-gray-400 hover:text-orange-600 transition-all flex items-center gap-2">
                  <i className="fas fa-chevron-left"></i> Categorias
                </button>
                <span className="bg-orange-50 text-orange-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest italic">{selectedCategory}</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {masterCatalog.filter(m => m.categoria === selectedCategory).map(m => {
                  const isInInventory = inventory.some(i => Number(i.material_id) === Number(m.id));
                  const isSelected = selectedMaterialToAdd?.id === m.id;

                  return (
                    <div key={m.id} className={`flex flex-col gap-3 p-5 rounded-[2.5rem] border transition-all ${isSelected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-200' : isInInventory ? 'opacity-40 bg-gray-50 border-gray-100 grayscale' : 'bg-white border-gray-100'}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                           <span className="font-black text-slate-800 text-xs uppercase tracking-tight leading-none block">{m.nome}</span>
                           <span className="text-[9px] text-gray-400 font-bold uppercase mt-1 italic">{m.unidade}</span>
                        </div>
                        {isInInventory ? (
                          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-500 flex items-center justify-center">
                             <i className="fas fa-check-double text-xs"></i>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setSelectedMaterialToAdd(isSelected ? null : m)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                          >
                            <i className={`fas ${isSelected ? 'fa-times' : 'fa-plus'} text-xs`}></i>
                          </button>
                        )}
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-2 pt-3 border-t border-orange-200 animate-in slide-in-from-top-2">
                          <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400 italic text-sm">R$</span>
                            <input 
                              type="number" 
                              placeholder="0,00"
                              step="0.01"
                              autoFocus
                              className="w-full bg-white border border-orange-200 rounded-xl pl-12 pr-4 py-4 outline-none font-black text-lg shadow-sm"
                              value={newMaterialPrice}
                              onChange={e => setNewMaterialPrice(e.target.value)}
                            />
                          </div>
                          <button 
                            disabled={!newMaterialPrice || isSaving}
                            onClick={handleAddMaterial}
                            className="bg-slate-900 text-white h-14 px-8 rounded-xl font-black text-[11px] uppercase shadow-lg active:scale-95 disabled:opacity-30"
                          >
                            {isSaving ? <i className="fas fa-circle-notch fa-spin"></i> : 'Confirmar'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
