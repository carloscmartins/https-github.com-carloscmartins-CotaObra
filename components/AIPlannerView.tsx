
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
      const { data } = await supabase.from('materiais').select('*').eq('ativo', true);
      if (data) setMasterList(data);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const systemInstruction = `
        Você é o Especialista Técnico da ASAPOBRA (As Soon As Possible Obra). 
        Seu papel é ser rápido, técnico e ajudar o mestre de obra ou proprietário a não esquecer nada.

        DIRETRIZES:
        1. IDENTIDADE: Foco total em agilidade (ASAP). Linguagem direta de canteiro de obras.
        2. IDIOMA: Português do Brasil.
        3. MÉTODO: Ajude o usuário a definir quantidades exatas.
        
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
      setMessages(prev => [...prev, { role: 'model', text: 'Deu erro na rede da obra. Vamos de novo?' }]);
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
            <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm font-medium shadow-sm ${
              m.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-gray-100 rounded-tl-none'
            }`}>
              {m.text.split('\n').map((line, idx) => <p key={idx} className="mb-1">{line}</p>)}
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-white p-4 rounded-2xl border border-gray-100"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:0.4s]"></div></div></div></div>}

        {suggestions.length > 0 && (
          <div className="bg-orange-600 text-white p-8 rounded-[3rem] shadow-2xl mt-8 space-y-6 animate-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-white/20 pb-4">
              <i className="fas fa-hard-hat text-xl"></i>
              <h4 className="text-[11px] font-black uppercase tracking-widest">Plano Gerado ASAP</h4>
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto no-scrollbar">
              {suggestions.map((s, idx) => {
                const mat = masterList.find(m => m.id === s.materialId);
                return mat ? (
                  <div key={idx} className="bg-white/10 p-4 rounded-2xl flex justify-between items-center border border-white/10">
                    <div className="flex-1 mr-4">
                      <p className="text-xs font-black uppercase tracking-tight">{mat.nome}</p>
                      <p className="text-[9px] text-orange-100 mt-1 font-bold">{s.rationale}</p>
                    </div>
                    <span className="text-[10px] font-black bg-white text-orange-700 px-3 py-1.5 rounded-xl shrink-0">{s.quantity}</span>
                  </div>
                ) : null;
              })}
            </div>
            <button onClick={startQuotation} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-[11px] uppercase transition-all shadow-xl hover:bg-black active:scale-95">
              Cotar ASAP
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex gap-2">
          <input className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-6 py-5 text-sm font-bold outline-none focus:border-orange-500 shadow-inner" placeholder="O que você precisa ASAP?" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} disabled={loading} />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="w-16 h-16 bg-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all shadow-orange-100"><i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`}></i></button>
        </div>
      </div>
    </div>
  );
};