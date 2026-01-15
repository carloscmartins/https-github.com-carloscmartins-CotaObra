
import React, { useState, useEffect } from 'react';
import { UserRole, MasterMaterial } from './types';
import { Header } from './components/Header';
import { ConstructorView } from './components/ConstructorView';
import { MerchantView } from './components/MerchantView';
import { AIPlannerView } from './components/AIPlannerView';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | 'planner'>(() => {
    const saved = localStorage.getItem('asapobra_role_v1');
    return (saved as any) || UserRole.CONSTRUCTOR;
  });

  const [preSelectedMaterials, setPreSelectedMaterials] = useState<MasterMaterial[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<{materialId: number, quantity: string, rationale?: string}[]>([]);

  useEffect(() => {
    localStorage.setItem('asapobra_role_v1', role);
  }, [role]);

  const handleAISelection = (materials: MasterMaterial[], suggestions: {materialId: number, quantity: string, rationale?: string}[]) => {
    setPreSelectedMaterials(materials);
    setAiSuggestions(suggestions);
    setRole(UserRole.CONSTRUCTOR);
  };

  const handleResetSearch = () => {
    setPreSelectedMaterials([]);
    setAiSuggestions([]);
    setRole(UserRole.CONSTRUCTOR);
  };

  return (
    <div className="min-h-screen flex flex-col pb-20 sm:pb-0 bg-[#F9FAFB]">
      <Header role={role === 'planner' ? UserRole.CONSTRUCTOR : role} setRole={(r) => {
        if (r === UserRole.CONSTRUCTOR) handleResetSearch();
        else setRole(r);
      }} />
      
      <main className="flex-1 overflow-y-auto no-scrollbar">
        {role === 'planner' && <AIPlannerView onSelectMaterials={handleAISelection} />}
        {role === UserRole.CONSTRUCTOR && (
          <ConstructorView 
            preSelected={preSelectedMaterials} 
            aiSuggestions={aiSuggestions}
            onOpenAIPlanner={() => { setRole('planner'); }}
          />
        )}
        {role === UserRole.MERCHANT && <MerchantView />}
      </main>

      {/* Persistent Bottom Bar - Mobile Focused */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-8 py-5 flex justify-between items-center sm:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-[50] rounded-t-[2.5rem]">
        <button 
          onClick={() => { setRole('planner'); }}
          className={`flex flex-col items-center transition-all ${role === 'planner' ? 'text-orange-600 scale-110' : 'text-gray-300'}`}
        >
          <i className="fas fa-hard-hat text-xl"></i>
          <span className="text-[9px] font-black uppercase mt-1.5 tracking-tighter">Planner</span>
        </button>
        <button 
          onClick={() => { handleResetSearch(); }}
          className={`flex flex-col items-center transition-all ${role === UserRole.CONSTRUCTOR ? 'text-orange-600 scale-110' : 'text-gray-300'}`}
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center -mt-8 shadow-xl transition-all ${role === UserRole.CONSTRUCTOR ? 'bg-orange-600 text-white' : 'bg-white text-gray-300'}`}>
            <i className="fas fa-bolt text-xl"></i>
          </div>
          <span className="text-[9px] font-black uppercase mt-1 tracking-tighter italic text-orange-600">ASAP</span>
        </button>
        <button 
          onClick={() => setRole(UserRole.MERCHANT)}
          className={`flex flex-col items-center transition-all ${role === UserRole.MERCHANT ? 'text-orange-600 scale-110' : 'text-gray-300'}`}
        >
          <i className="fas fa-store text-xl"></i>
          <span className="text-[9px] font-black uppercase mt-1.5 tracking-tighter">Loja</span>
        </button>
      </nav>
    </div>
  );
};

export default App;