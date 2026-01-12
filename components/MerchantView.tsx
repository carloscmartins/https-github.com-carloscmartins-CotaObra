
import React, { useState, useEffect } from 'react';
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
  'default': { icon: 'fa-box', color: 'text-orange-500', bg: 'bg-orange-50' }
};

export const MerchantView: React.FC = () => {
  const [store, setStore] = useState<{ id: string, name: string } | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreWhatsapp, setNewStoreWhatsapp] = useState('');

  const [showCatalog, setShowCatalog] = useState(false);
  const [masterCatalog, setMasterCatalog] = useState<MasterMaterial[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [inventory, setInventory] = useState<Product[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  
  const [assocPrice, setAssocPrice] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MasterMaterial | null>(null);

  useEffect(() => {
    const savedStore = localStorage.getItem('cotaobra_store_v1');
    if (savedStore) {
      const parsedStore = JSON.parse(savedStore);
      setStore(parsedStore);
      fetchInventory(parsedStore.id);
    }
    fetchMasterCatalog();
  }, []);

  const fetchMasterCatalog = async () => {
    try {
      const { data, error } = await supabase.from('materiais').select('*').eq('ativo', true).order('nome', { ascending: true });
      if (!error && data) {
        setMasterCatalog(data);
        const uniqueCats = Array.from(new Set(data.map((m: any) => m.categoria))).filter(Boolean) as string[];
        setCategories(uniqueCats.sort());
      }
    } catch (e) {
      console.error("Erro ao carregar catálogo mestre:", e);
    }
  };

  const fetchInventory = async (storeId: string) => {
    setLoadingInventory(true);
    try {
      const { data } = await supabase.from('products').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
      if (data) {
        setInventory(data.map((item: any) => ({ ...item, imageUrl: item.image_url })));
      }
    } catch (e) {
      console.error("Erro ao carregar inventário:", e);
    }
    setLoadingInventory(false);
  };

  const handleCreateStore = async () => {
    if (!newStoreName || !newStoreWhatsapp) return;
    setIsRegistering(true);
    try {
      const newId = crypto.randomUUID();
      const cleanWhatsapp = newStoreWhatsapp.replace(/\D/g, '');
      
      const { error } = await supabase.from('stores').insert([{
        id: newId,
        name: newStoreName,
        whatsapp: cleanWhatsapp,
        address: 'Endereço Comercial - Editável',
        delivery_radius_km: 100,
        location: 'SRID=4326;POINT(-46.633308 -23.55052)'
      }]);

      if (error) throw error;

      const storeData = { id: newId, name: newStoreName };
      localStorage.setItem('cotaobra_store_v1', JSON.stringify(storeData));
      setStore(storeData);
      setInventory([]);
    } catch (err: any) {
      alert("Ops! Houve um erro ao criar a loja: " + err.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleAssociateMaterial = async () => {
    if (!selectedMaterial || !assocPrice || !store || isSaving) return;
    
    setIsSaving(true);
    try {
      const productToInsert = {
        name: selectedMaterial.nome,
        description: selectedMaterial.descricao || `Material da categoria ${selectedMaterial.categoria}`,
        category: selectedMaterial.categoria,
        price: parseFloat(assocPrice),
        store_id: store.id,
        material_id: selectedMaterial.id,
        image_url: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=800&auto=format&fit=crop',
        active: true
      };

      const { data, error } = await supabase.from('products').insert([productToInsert]).select();
      
      if (!error && data) {
        setInventory(prev => [{...data[0], imageUrl: data[0].image_url}, ...prev]);
        setSelectedMaterial(null);
        setAssocPrice('');
        setShowCatalog(false);
        setSelectedCategory(null);
      } else {
        throw error;
      }
    } catch (err: any) {
      alert("Erro ao associar material: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Remover este produto do estoque?")) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (!error) setInventory(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      alert("Erro ao excluir.");
    }
  };

  const startEditing = (item: Product) => {
    setEditingId(item.id);
    setEditPrice(item.price.toString());
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
    } catch (e) {
      alert("Erro ao atualizar preço.");
    }
  };

  const filteredMaterials = masterCatalog.filter(m => {
    const matchesCategory = selectedCategory ? m.categoria === selectedCategory : true;
    const matchesSearch = m.nome.toLowerCase().includes(catalogSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!store) {
    return (
      <div className="p-6 max-w-md mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-orange-600 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-orange-200">
             <i className="fas fa-store text-white text-3xl"></i>
          </div>
          <h2 className="text-2xl font-black italic text-slate-900 uppercase tracking-tighter">Entrar como Lojista</h2>
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Acesso rápido para o seu MVP</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-50 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">Nome da Loja</label>
              <input 
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-4 outline-none focus:border-orange-500 font-bold text-sm"
                placeholder="Ex: Madeireira Silva"
                value={newStoreName}
                onChange={e => setNewStoreName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">WhatsApp</label>
              <input 
                type="tel"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-4 outline-none focus:border-orange-500 font-bold text-sm"
                placeholder="DD 999999999"
                value={newStoreWhatsapp}
                onChange={e => setNewStoreWhatsapp(e.target.value)}
              />
            </div>
          </div>
          
          <button 
            disabled={!newStoreName || !newStoreWhatsapp || isRegistering}
            onClick={handleCreateStore}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-black active:scale-95 disabled:opacity-30 transition-all"
          >
            {isRegistering ? <i className="fas fa-circle-notch fa-spin mr-2"></i> : null}
            Criar Minha Loja
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto pb-24">
      {/* Header da Loja */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-black italic tracking-tighter text-orange-500 uppercase">{store.name}</h2>
            <p className="text-slate-400 text-[9px] font-bold uppercase mt-1 tracking-widest">Lojista Parceiro</p>
          </div>
          <button 
            onClick={() => { if(confirm("Sair desta loja?")) { localStorage.removeItem('cotaobra_store_v1'); setStore(null); } }}
            className="bg-white/10 hover:bg-red-500/20 p-2 rounded-lg transition-colors"
          >
            <i className="fas fa-power-off text-white/40 text-xs"></i>
          </button>
        </div>
        
        <div className="mt-8">
          <button 
            onClick={() => { setShowCatalog(true); setSelectedCategory(null); }}
            className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all"
          >
            <i className="fas fa-plus-circle text-lg"></i>
            Cadastrar Produtos
          </button>
        </div>
      </div>

      {/* Grid de Itens */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-4">
          <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Meus Itens ({inventory.length})</h3>
        </div>
        
        {loadingInventory ? (
          <div className="text-center py-20"><i className="fas fa-circle-notch fa-spin text-orange-500 text-2xl"></i></div>
        ) : inventory.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {inventory.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col hover:border-orange-100 transition-all shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-xl overflow-hidden border border-gray-50">
                      <img src={item.imageUrl} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 text-xs leading-tight">{item.name}</h4>
                      <p className="text-[9px] font-black text-orange-500 uppercase mt-1">R$ {item.price?.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditing(item)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-orange-500">
                      <i className="fas fa-pencil-alt text-[10px]"></i>
                    </button>
                    <button onClick={() => handleDeleteProduct(item.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-200 hover:text-red-500">
                      <i className="fas fa-trash-alt text-[10px]"></i>
                    </button>
                  </div>
                </div>

                {editingId === item.id && (
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2">
                    <input 
                      type="number"
                      className="flex-1 bg-gray-50 border border-orange-200 rounded-lg px-3 py-2 outline-none font-bold text-xs"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                    />
                    <button onClick={() => handleUpdatePrice(item.id)} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase">OK</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-50 p-8">
            <p className="text-slate-400 text-[10px] font-black uppercase">Toque em adicionar para começar</p>
          </div>
        )}
      </div>

      {/* Catalog Modal */}
      {showCatalog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2rem] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-5">
            
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-black text-gray-900 uppercase text-xs">
                {!selectedCategory ? 'O que você vende?' : selectedCategory}
              </h3>
              <button onClick={() => { setShowCatalog(false); setSelectedMaterial(null); setSelectedCategory(null); }}>
                <i className="fas fa-times-circle text-gray-300 text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              {!selectedCategory ? (
                <div className="grid grid-cols-2 gap-3">
                  {categories.map(cat => {
                    const ui = CATEGORY_UI[cat] || CATEGORY_UI.default;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className="p-5 bg-white border border-gray-100 rounded-2xl text-center hover:border-orange-500 transition-all"
                      >
                        <i className={`fas ${ui.icon} ${ui.color} text-lg mb-2 block`}></i>
                        <span className="font-black text-[8px] text-gray-800 uppercase tracking-widest">{cat}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <button onClick={() => { setSelectedCategory(null); setSelectedMaterial(null); }} className="text-[9px] font-black text-orange-600 uppercase mb-4">
                    <i className="fas fa-chevron-left mr-1"></i> Voltar
                  </button>
                  {filteredMaterials.map(m => (
                    <button 
                      key={m.id}
                      onClick={() => setSelectedMaterial(m)}
                      className={`w-full p-4 rounded-xl border text-left flex justify-between items-center ${
                        selectedMaterial?.id === m.id ? 'border-orange-500 bg-orange-50' : 'border-gray-50 bg-white'
                      }`}
                    >
                      <span className="font-bold text-gray-800 text-xs">{m.nome}</span>
                      <i className={`fas ${selectedMaterial?.id === m.id ? 'fa-check-circle text-orange-600' : 'fa-plus text-gray-200'}`}></i>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedMaterial && (
              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <input 
                    type="number" 
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-600 font-black text-lg"
                    placeholder="Preço R$"
                    value={assocPrice}
                    onChange={e => setAssocPrice(e.target.value)}
                  />
                  <button 
                    disabled={!assocPrice || isSaving}
                    onClick={handleAssociateMaterial}
                    className="bg-orange-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg disabled:opacity-30"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
