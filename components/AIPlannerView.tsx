
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import { MasterMaterial } from '../types';
import { supabase } from '../supabase';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AIPlannerViewProps {
  onSelectMaterials: (materials: MasterMaterial[], suggestions: {materialId: number, quantity: string, rationale?: string}[]) => void;
}

export const AIPlannerView: React.FC<AIPlannerViewProps> = ({ onSelectMaterials }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Fala chefe! 👷‍♂️\nSou o assistente da ASAPOBRA. Me diz o que você vai aprontar na obra hoje e eu monto sua lista pra ontem!' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [masterList, setMasterList] = useState<MasterMaterial[]>([]);
  const [suggestions, setSuggestions] = useState<{materialId: number, rationale: string, quantity: string}[]>([]);
  
  const chatRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      // Busca os materiais REAIS da base de dados
      const { data, error } = await supabase.from('materiais').select('*').eq('ativo', true);
      
      // Se não houver dados no banco, usa o catálogo estático como fallback para não quebrar a IA
      const materialsToUse = (data && data.length > 0) ? data : [];
      setMasterList(materialsToUse);

      // Correct initialization with named parameter
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      // Monta a string do catálogo com os nomes REAIS vindos do banco
      const catalogString = materialsToUse.map(m => 
        `- ID: ${m.id} | Nome: ${m.nome} | Categoria: ${m.categoria} | Unidade: ${m.unidade}`
      ).join('\n');

      const systemInstruction = `
        Você é o Especialista Técnico da ASAPOBRA.
        Seu objetivo é ajudar o usuário a montar uma lista de materiais baseada EXATAMENTE no catálogo fornecido.

        REGRAS CRÍTICAS:
        1. Se o usuário perguntar "quais cimentos você tem" ou "liste os cimentos", você deve olhar a lista abaixo e retornar os nomes EXATOS (ex: "Cimento CP V-ARI 50kg Cauê").
        2. Não invente marcas ou modelos que não estejam na lista abaixo.
        3. Linguagem: Prática, rápida e profissional de obra.
        
        CATÁLOGO REAL DO BANCO DE DADOS:
        ${catalogString}
        
        FORMATO DE RESPOSTA:
        Responda naturalmente e, sempre que sugerir itens para compra, inclua o JSON técnico no final:
        [SUGESTOES_INICIO]
        { "suggestions": [ { "materialId": number, "rationale": string, "quantity": string } ] }
        [SUGESTOES_FIM]
      `;

      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction, temperature: 0.2 } // Menor temperatura para ser mais fiel à lista
      });
    };
    init();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || !chatRef.current || loading) return;
    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLoading(true);
    
    try {
      const response: GenerateContentResponse = await chatRef.current.sendMessage({ message: userText });
      // Access .text property directly (not a method)
      const modelText = response.text || '';
      
      const jsonMatch = modelText.match(/\[SUGESTOES_INICIO\]([\s\S]*?)\[SUGESTOES_FIM\]/);
      let cleanText = modelText.replace(/\[SUGESTOES_INICIO\]([\s\S]*?)\[SUGESTOES_FIM\]/, '').trim();
      
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[1]);
          if (result.suggestions) setSuggestions(result.suggestions);
        } catch (e) { console.error("Erro parse JSON IA:", e); }
      }
      
      setMessages(prev => [...prev, { role: 'model', text: cleanText }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: 'Tive um problema na conexão. Pode repetir?' }]);
    } finally { setLoading(false); }
  };

  const startQuotation = () => {
    const selected = masterList.filter(m => suggestions.some(s => s.materialId === m.id));
    onSelectMaterials(selected, suggestions.map(s => ({ 
      materialId: s.materialId, 
      quantity: s.quantity, 
      rationale: s.rationale 
    })));
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto bg-gray-50 overflow-hidden relative">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 no-scrollbar pb-32">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
            <div className={`max-w-[90%] sm:max-w-[85%] p-4 sm:p-5 rounded-[2rem] text-sm font-medium shadow-sm ${
              m.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-gray-100 rounded-tl-none'
            }`}>
              {m.text.split('\n').map((line, idx) => <p key={idx} className="mb-1 leading-relaxed">{line}</p>)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="bg-orange-600 text-white p-6 sm:p-8 rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl mt-8 space-y-6 animate-in zoom-in-95 sticky bottom-0 border-4 border-white/10">
            <div className="flex items-center gap-3 border-b border-white/20 pb-4">
              <i className="fas fa-magic text-lg"></i>
              <h4 className="text-[10px] font-black uppercase tracking-widest">Itens Identificados</h4>
            </div>
            <div className="space-y-2.5 max-h-48 overflow-y-auto no-scrollbar">
              {suggestions.map((s, idx) => {
                const mat = masterList.find(m => m.id === s.materialId);
                return mat ? (
                  <div key={idx} className="bg-white/10 p-3.5 rounded-2xl flex justify-between items-center border border-white/5">
                    <div className="flex-1 mr-3 text-left">
                      <p className="text-[11px] font-black uppercase tracking-tight">{mat.nome}</p>
                      <p className="text-[8px] text-orange-100 mt-0.5 font-bold italic">{s.rationale}</p>
                    </div>
                    <span className="text-[10px] font-black bg-white text-orange-700 px-3 py-1 rounded-xl shrink-0">{s.quantity}</span>
                  </div>
                ) : null;
              })}
            </div>
            <button onClick={startQuotation} className="w-full bg-slate-900 text-white py-4.5 rounded-2xl font-black text-[10px] uppercase transition-all shadow-xl hover:bg-black active:scale-95 flex items-center justify-center gap-2 h-14">
              <i className="fas fa-bolt"></i>
              Converter em Cotação
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100 sm:rounded-t-[3rem] shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <input 
            className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-orange-500 shadow-inner" 
            placeholder="Ex: Liste todos os cimentos da lista" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSend()} 
            disabled={loading} 
          />
          <button 
            onClick={handleSend} 
            disabled={loading || !input.trim()} 
            className="w-14 h-14 bg-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all shrink-0 shadow-orange-100"
          >
            <i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`}></i>
          </button>
        </div>
      </div>
    </div>
  );
};
