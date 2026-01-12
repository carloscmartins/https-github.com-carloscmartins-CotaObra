
import { GoogleGenAI, Type } from "@google/genai";

// O process.env.API_KEY é injetado pelo ambiente de execução.
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const identifyProductFromImage = async (base64Image: string) => {
  if (!apiKey) throw new Error("API_KEY do Gemini não configurada.");

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: { mimeType: 'image/jpeg', data: base64Image }
        },
        {
          text: "Identify the construction material. Return JSON with name, description, category, price, and metadata.",
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
          metadata: { type: Type.OBJECT }
        },
        required: ["name", "description", "category", "price"],
      },
    },
  });

  return JSON.parse(response.text);
};

export const generateProductImage = async (productName: string, category: string): Promise<string> => {
  if (!apiKey) return '';
  try {
    const prompt = `Professional studio photo of ${productName}, ${category} category, construction material, isolated, white background.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts: [{ text: prompt }] }],
      config: { imageConfig: { aspectRatio: "1:1" } }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return '';
  } catch (error) {
    return 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=800&auto=format&fit=crop';
  }
};
