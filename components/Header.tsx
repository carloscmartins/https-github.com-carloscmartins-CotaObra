
import React from 'react';
import { UserRole } from '../types';

interface HeaderProps {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

export const Header: React.FC<HeaderProps> = ({ role, setRole }) => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-2">
        <div className="bg-slate-900 text-white px-4 py-1.5 rounded-2xl font-extrabold tracking-tighter text-xl shadow-lg flex items-center gap-2">
          <i className="fas fa-hard-hat text-orange-500 text-lg"></i>
          <span>ASAP<span className="text-orange-500">OBRA</span></span>
        </div>
        <div className="hidden md:block border-l border-gray-100 ml-2 pl-3">
            <p className="text-[9px] font-bold uppercase text-gray-400 tracking-widest leading-none">As Soon As <span className="text-orange-600">Possible</span></p>
        </div>
      </div>
      
      <div className="flex bg-gray-50 p-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-gray-100">
        <button
          onClick={() => setRole(UserRole.CONSTRUCTOR)}
          className={`px-6 py-2.5 rounded-xl transition-all ${
            role === UserRole.CONSTRUCTOR 
              ? 'bg-white text-orange-700 shadow-sm border border-gray-100' 
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          Pesquisar
        </button>
        <button
          onClick={() => setRole(UserRole.MERCHANT)}
          className={`px-6 py-2.5 rounded-xl transition-all ${
            role === UserRole.MERCHANT 
              ? 'bg-white text-orange-700 shadow-sm border border-gray-100' 
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          Lojista
        </button>
      </div>
    </header>
  );
};
