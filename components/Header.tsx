
import React from 'react';
import { UserRole } from '../types';

interface HeaderProps {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

export const Header: React.FC<HeaderProps> = ({ role, setRole }) => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-2">
        <div className="bg-orange-600 text-white p-2 rounded-lg">
          <i className="fas fa-hard-hat text-xl"></i>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Cota<span className="text-orange-600">Obra</span>
        </h1>
      </div>
      
      <div className="flex bg-gray-100 p-1 rounded-full text-sm font-medium">
        <button
          onClick={() => setRole(UserRole.CONSTRUCTOR)}
          className={`px-4 py-1.5 rounded-full transition-all ${
            role === UserRole.CONSTRUCTOR 
              ? 'bg-white text-orange-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pesquisar
        </button>
        <button
          onClick={() => setRole(UserRole.MERCHANT)}
          className={`px-4 py-1.5 rounded-full transition-all ${
            role === UserRole.MERCHANT 
              ? 'bg-white text-orange-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Lojista
        </button>
      </div>
    </header>
  );
};
