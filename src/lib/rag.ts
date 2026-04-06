import { GoogleGenAI } from "@google/genai";

export interface Chunk {
  text: string;
  embedding: number[];
  docName: string;
}

export interface DocumentWithChunks {
  name: string;
  chunks: Chunk[];
}

// Enhanced chunking with overlap to prevent cutting off context
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

export async function generateEmbeddings(ai: GoogleGenAI, text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-2-preview',
    contents: text,
  });
  return result.embeddings[0].values;
}

export async function generateEmbeddingsBatch(ai: GoogleGenAI, texts: string[]): Promise<number[][]> {
  const batchSize = 10; // Process in small batches to avoid rate limits
  const allEmbeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const result = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: batch,
      });
      
      const batchEmbeddings = result.embeddings.map(e => e.values);
      allEmbeddings.push(...batchEmbeddings);
      
      // Delay between batches to respect rate limits (1 second)
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error("Error generating embeddings for batch:", error);
      throw error;
    }
  }
  
  return allEmbeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function retrieveRelevantChunks(
  ai: GoogleGenAI,
  query: string,
  documents: DocumentWithChunks[],
  topK: number = 8 // Increased from 3 to 8 for better recall
): Promise<{ docName: string; text: string; similarity: number }[]> {
  const queryEmbedding = await generateEmbeddings(ai, query);
  
  const allChunks: { docName: string; text: string; similarity: number }[] = [];
  
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      allChunks.push({ docName: chunk.docName, text: chunk.text, similarity });
    }
  }
  
  allChunks.sort((a, b) => b.similarity - a.similarity);
  
  return allChunks.slice(0, topK);
}
