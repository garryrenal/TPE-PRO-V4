import { GoogleGenAI } from "@google/genai";

export async function generateDesignOptions(imageBuffer: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompts = [
    "A clean, minimalist UI design for a medical procedure summary grid. Three columns: REPLACED (green theme), REMOVED (red theme), and PT. FLUID BAL (blue theme). No input boxes, no arrows. Just clean typography with labels in small caps and large, clear numerical values. Soft white background, subtle gray dividers. Professional and clinical aesthetic.",
    "A modern bento-box style UI dashboard for medical data. Three distinct sections for Replaced, Removed, and Fluid Balance. Each section has a subtle background color (light green, light red, light blue). No input fields or form elements. Values are displayed in a large, bold sans-serif font. Labels are clear and positioned above the values. High whitespace, very clean and readable.",
    "A sleek, technical data grid for a medical summary. Structured layout with thin, elegant lines. Labels on the left, values on the right. No boxes or arrows. Uses a professional font like Inter or a clean monospace for numbers. Color accents for section headers (Green, Red, Blue). Minimalist and high-end medical software look."
  ];

  const results = [];

  for (const prompt of prompts) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: imageBuffer, mimeType: "image/png" } }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        results.push(`data:image/png;base64,${part.inlineData.data}`);
      }
    }
  }

  return results;
}
