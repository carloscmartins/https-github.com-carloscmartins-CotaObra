
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const identifyProductFromImage = async (base64Image: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: "Identify the construction material in this photo or invoice. Return the product name, a short description, an estimated price (BRL), the category, and technical metadata (brand, unit, material, etc).",
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          price: { type: Type.NUMBER },
          metadata: { 
            type: Type.OBJECT,
            properties: {
              brand: { type: Type.STRING },
              material: { type: Type.STRING },
              unit: { type: Type.STRING, description: "e.g., kg, meters, unit" }
            }
          }
        },
        required: ["name", "description", "category", "price"],
      },
    },
  });

  const data = JSON.parse(response.text);
  
  // Lógica de fallback de imagem baseada na categoria (Simulando o que seria o bucket do Supabase)
  const cat = data.category.toLowerCase();
  data.imageUrl = 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=800&auto=format&fit=crop';
  if (cat.includes('cimento')) data.imageUrl = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop';
  if (cat.includes('hidr') || cat.includes('pvc')) data.imageUrl = 'https://plus.unsplash.com/premium_photo-1661962363024-934f8611736b?q=80&w=800&auto=format&fit=crop';
  if (cat.includes('ferramenta')) data.imageUrl = 'https://images.unsplash.com/photo-1530124560277-b61f10c08dc4?q=80&w=800&auto=format&fit=crop';

  return data;
};

export const generateProductImage = async (productName: string, category: string): Promise<string> => {
  try {
    const prompt = `A professional studio catalog photo of ${productName}, ${category} category, construction material, isolated on white background, 4k, realistic lighting.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return '';
  } catch (error) {
    console.error("Erro ao gerar imagem:", error);
    return 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=800&auto=format&fit=crop';
  }
};
