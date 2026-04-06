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

// Semantic chunking with overlap to prevent cutting off context and respect sentence boundaries
export function chunkText(text: string, chunkSize: number = 1200, overlap: number = 300): string[] {
  const chunks: string[] = [];
  // Clean up excessive whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  let i = 0;
  while (i < cleanText.length) {
    let end = i + chunkSize;
    
    // Try to find a sentence boundary near the end of the chunk to avoid cutting mid-sentence
    if (end < cleanText.length) {
      const searchArea = cleanText.substring(Math.max(0, end - 100), Math.min(cleanText.length, end + 100));
      const boundary = searchArea.search(/[.!?]\s/);
      if (boundary !== -1) {
        end = Math.max(0, end - 100) + boundary + 1;
      }
    }
    
    chunks.push(cleanText.slice(i, end).trim());
    i = end - overlap;
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
  topK: number = 12, // Increased for better recall
  minSimilarity: number = 0.45 // Filter out irrelevant noise
): Promise<{ docName: string; text: string; similarity: number }[]> {
  const queryEmbedding = await generateEmbeddings(ai, query);
  
  const allChunks: { docName: string; text: string; similarity: number }[] = [];
  
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (similarity >= minSimilarity) {
        allChunks.push({ docName: chunk.docName, text: chunk.text, similarity });
      }
    }
  }
  
  allChunks.sort((a, b) => b.similarity - a.similarity);
  
  return allChunks.slice(0, topK);
}
