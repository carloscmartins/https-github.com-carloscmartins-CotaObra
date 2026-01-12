
import React, { useState, useEffect } from 'react';
import { UserRole } from './types';
import { Header } from './components/Header';
import { ConstructorView } from './components/ConstructorView';
import { MerchantView } from './components/MerchantView';

const App: React.FC = () => {
  // Persiste a escolha do papel do usuário para não resetar no refresh
  const [role, setRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('cotaobra_user_role');
    return (saved as UserRole) || UserRole.CONSTRUCTOR;
  });

  useEffect(() => {
    localStorage.setItem('cotaobra_user_role', role);
  }, [role]);

  return (
    <div className="min-h-screen flex flex-col pb-20 sm:pb-0 bg-[#F9FAFB]">
      <Header role={role} setRole={setRole} />
      
      <main className="flex-1 overflow-y-auto no-scrollbar">
        {role === UserRole.CONSTRUCTOR ? <ConstructorView /> : <MerchantView />}
      </main>

      {/* Persistent Bottom Bar - Mobile Focused */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-100 px-10 py-4 flex justify-between items-center sm:hidden shadow-[0_-8px_30px_rgb(0,0,0,0.04)] z-[50]">
        <button 
          onClick={() => setRole(UserRole.CONSTRUCTOR)}
          className={`flex flex-col items-center transition-all ${role === UserRole.CONSTRUCTOR ? 'text-orange-600 scale-110' : 'text-gray-300'}`}
        >
          <i className="fas fa-search text-xl"></i>
          <span className="text-[9px] font-black uppercase mt-1 tracking-tighter">Cotar</span>
        </button>
        <button 
          onClick={() => setRole(UserRole.MERCHANT)}
          className={`flex flex-col items-center transition-all ${role === UserRole.MERCHANT ? 'text-orange-600 scale-110' : 'text-gray-300'}`}
        >
          <i className="fas fa-store text-xl"></i>
          <span className="text-[9px] font-black uppercase mt-1 tracking-tighter">Loja</span>
        </button>
        <button className="flex flex-col items-center text-gray-300 opacity-50 cursor-not-allowed">
          <i className="fas fa-history text-xl"></i>
          <span className="text-[9px] font-black uppercase mt-1 tracking-tighter">Pedidos</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
