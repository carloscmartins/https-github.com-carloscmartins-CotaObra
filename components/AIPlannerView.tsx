
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, Chat } from "@google/genai";
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
    { role: 'model', text: 'Olá! Sou seu Consultor Técnico da CotaObra. 🏗️\nEstou aqui para te ajudar a identificar os materiais necessários para sua reforma ou construção. Como posso ajudar hoje?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [masterList, setMasterList] = useState<MasterMaterial[]>([]);
  const [suggestions, setSuggestions] = useState<{materialId: number, rationale: string, quantity: string}[]>([]);
  
  const chatRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('materiais').select('*').eq('ativo', true);
      if (data) setMasterList(data);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const systemInstruction = `
        Você é o Consultor Técnico oficial da plataforma CotaObra. 
        Sua missão é ajudar o usuário a listar materiais para reformas e construções baseando-se NO CATÁLOGO fornecido.

        DIRETRIZES:
        1. IDENTIDADE: Você é um CONSULTOR TÉCNICO.
        2. IDIOMA: Português do Brasil.
        3. MÉTODO: Faça perguntas uma por uma para entender o contexto (metragem, ambiente, etc).
        
        CATÁLOGO:
        ${data?.map(m => `ID: ${m.id}, Nome: ${m.nome}, Unidade: ${m.unidade}`).join('\n')}
        
        SAÍDA TÉCNICA (JSON):
        No FINAL da mensagem, apresente a lista de materiais neste formato:
        [SUGESTOES_INICIO]
        { "suggestions": [ { "materialId": number, "rationale": string, "quantity": string } ] }
        [SUGESTOES_FIM]
      `;

      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction, temperature: 0.7 }
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
      const response = await chatRef.current.sendMessage({ message: userText });
      const modelText = response.text;
      const jsonMatch = modelText.match(/\[SUGESTOES_INICIO\]([\s\S]*?)\[SUGESTOES_FIM\]/);
      let cleanText = modelText.replace(/\[SUGESTOES_INICIO\]([\s\S]*?)\[SUGESTOES_FIM\]/, '').trim();
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[1]);
          if (result.suggestions) setSuggestions(result.suggestions);
        } catch (e) { console.error(e); }
      }
      setMessages(prev => [...prev, { role: 'model', text: cleanText }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: 'Ops, tive um problema. Pode repetir?' }]);
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
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-2xl mx-auto bg-gray-50 overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
            <div className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium shadow-sm ${
              m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-gray-100 rounded-tl-none'
            }`}>
              {m.text.split('\n').map((line, idx) => <p key={idx}>{line}</p>)}
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-white p-4 rounded-2xl border border-gray-100"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></div></div></div></div>}

        {suggestions.length > 0 && (
          <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl mt-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
              <i className="fas fa-clipboard-check text-orange-500"></i>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-300">Lista Sugerida</h4>
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto no-scrollbar">
              {suggestions.map((s, idx) => {
                const mat = masterList.find(m => m.id === s.materialId);
                return mat ? (
                  <div key={idx} className="bg-slate-800 p-3 rounded-xl flex justify-between items-center border border-slate-700">
                    <div className="flex-1 mr-4">
                      <p className="text-xs font-bold text-orange-100">{mat.nome}</p>
                      <p className="text-[9px] text-slate-400 mt-1">{s.rationale}</p>
                    </div>
                    <span className="text-[10px] font-black text-orange-400 bg-orange-500/10 px-2 py-1 rounded-lg shrink-0">{s.quantity}</span>
                  </div>
                ) : null;
              })}
            </div>
            <button onClick={startQuotation} className="w-full bg-orange-600 hover:bg-orange-700 py-4 rounded-xl font-black text-[10px] uppercase transition-all shadow-lg">
              Comparar Preços desta Lista
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex gap-2">
          <input className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-semibold outline-none focus:border-orange-500" placeholder="Digite aqui..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} disabled={loading} />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center"><i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`}></i></button>
        </div>
      </div>
    </div>
  );
};
