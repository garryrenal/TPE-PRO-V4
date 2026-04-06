import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  Paperclip, 
  FileText, 
  Loader2, 
  Trash2,
  ChevronDown,
  ChevronUp,
  Bot,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import pdfToText from 'react-pdftotext';
import { KNOWLEDGE_BASE } from '../lib/knowledgeBase';
import { cn } from '../lib/utils';
import { chunkText, generateEmbeddings, generateEmbeddingsBatch, retrieveRelevantChunks, DocumentWithChunks } from '../lib/rag';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface ChatbotProps {
  appData: {
    calcMode: string;
    patientData: any;
    stats: any;
    activeScenario: string | null;
  };
  theme: string;
}

export function Chatbot({ appData, theme }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hello! I'm your Apheresis Assistant. Upload documents related to apheresis, and I'll answer your questions based on them. I also have access to your current calculation data." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentWithChunks[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ai = useRef(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string }));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsUploading(true);
    const newDocs: DocumentWithChunks[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        let content = '';
        if (file.type === 'application/pdf') {
          content = await pdfToText(file);
        } else if (file.type === 'text/plain' || file.name.endsWith('.md')) {
          content = await file.text();
        } else {
          console.warn(`Unsupported file type: ${file.type}`);
          continue;
        }
        
        const textChunks = chunkText(content);
        
        try {
          const embeddings = await generateEmbeddingsBatch(ai.current, textChunks);
          const chunks = textChunks.map((text, index) => ({
            text,
            docName: file.name,
            embedding: embeddings[index]
          }));
          
          newDocs.push({ name: file.name, chunks });
        } catch (error: any) {
          console.error(`Error generating embeddings for ${file.name}:`, error);
          if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
            setMessages(prev => [...prev, { 
              role: 'model', 
              content: `⚠️ **Rate Limit Exceeded** while processing "${file.name}". The document is too large or too many requests were made. Please try again later or upload a smaller document.` 
            }]);
          } else {
            setMessages(prev => [...prev, { 
              role: 'model', 
              content: `⚠️ Failed to process "${file.name}". Please try again.` 
            }]);
          }
        }
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
      }
    }

    if (newDocs.length > 0) {
      setDocuments(prev => [...prev, ...newDocs]);
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: `Successfully processed ${newDocs.length} document(s). You can now ask questions about them.` 
      }]);
    }
    
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Retrieve relevant chunks
      const relevantChunks = await retrieveRelevantChunks(ai.current, userMessage, documents, 8);
      const docContext = relevantChunks.map(c => `[Source Document: ${c.docName}]\n${c.text}`).join('\n\n---\n\n');
      
      const baseKnowledgeContext = `
        CORE DOCUMENTS (Base Knowledge):
        1. ASFA 2023 Guidelines: ${KNOWLEDGE_BASE.asfa2023}
        2. Preceptor Guide: ${KNOWLEDGE_BASE.preceptorGuide}
        3. Dialysis of Drugs (Bailie & Mason): ${KNOWLEDGE_BASE.dialysisOfDrugs}
      `;
      
      const appStateContext = `
        Current App Mode: ${appData.calcMode}
        Patient Data: ${JSON.stringify(appData.patientData)}
        Current Stats: ${JSON.stringify(appData.stats)}
        Active Scenario: ${appData.activeScenario || 'None'}
      `;

      const systemInstruction = `
        You are an Apheresis Specialist Assistant. 
        Your primary source of information is the CORE DOCUMENTS provided below. 
        You also have access to relevant chunks from user-uploaded documents.
        If the answer is not in the documents, but relates to the current application data, use the application data.
        If neither contains the answer, politely state that you don't have that information.
        
        CORE DOCUMENTS:
        ${baseKnowledgeContext}

        Current Application Data:
        ${appStateContext}
        
        Relevant User Uploaded Documents Context:
        ${docContext || 'No relevant documents found.'}
        
        Rules:
        1. Only base your answers on the provided documents (Core + Uploaded) and application data.
        2. Be concise and professional.
        3. Use Markdown for formatting.
        4. If asked about calculations, refer to the current stats provided in the context.
      `;

      const chat = ai.current.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({ 
        message: userMessage 
      });

      setMessages(prev => [...prev, { role: 'model', content: response.text || "I'm sorry, I couldn't generate a response." }]);
    } catch (error: any) {
      console.error("Chat error:", error);
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        setMessages(prev => [...prev, { role: 'model', content: "⚠️ **Rate Limit Exceeded**. Please wait a moment and try again." }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: "Sorry, I encountered an error. Please check your connection or try again later." }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={cn(
              "mb-4 w-[350px] sm:w-[400px] rounded-3xl shadow-2xl overflow-hidden border border-theme-card-border flex flex-col transition-all duration-300",
              isExpanded ? "h-[600px]" : "h-[500px]",
              "bg-theme-card"
            )}
          >
            {/* Header */}
            <div className="p-4 bg-theme-primary text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Apheresis Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-medium opacity-80">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Documents Bar */}
            {documents.length > 0 && (
              <div className="px-4 py-2 bg-theme-primary/5 border-b border-theme-card-border flex gap-2 overflow-x-auto no-scrollbar">
                {documents.map((doc, i) => (
                  <div 
                    key={i}
                    className="flex items-center gap-1.5 bg-white border border-theme-card-border px-2 py-1 rounded-lg shrink-0"
                  >
                    <FileText className="w-3 h-3 text-theme-primary" />
                    <span className="text-[10px] font-medium text-slate-600 max-w-[80px] truncate">{doc.name}</span>
                    <button 
                      onClick={() => removeDocument(i)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((m, i) => (
                <div 
                  key={i}
                  className={cn(
                    "flex gap-3",
                    m.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                    m.role === 'user' ? "bg-theme-primary text-white" : "bg-slate-100 text-slate-500"
                  )}>
                    {m.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed",
                    m.role === 'user' 
                      ? "bg-theme-primary text-white rounded-tr-none" 
                      : "bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none"
                  )}>
                    <div className="prose prose-sm prose-slate max-w-none">
                      <Markdown>
                        {m.content}
                      </Markdown>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl rounded-tl-none">
                    <Loader2 className="w-4 h-4 animate-spin text-theme-primary" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-theme-card-border bg-theme-bg">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-2 text-slate-400 hover:text-theme-primary transition-colors disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </button>
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept=".txt,.md,.pdf"
                  className="hidden"
                />
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask a question..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition-all"
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="p-2 bg-theme-primary text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[9px] text-slate-400 mt-2 text-center">
                Answers based on uploaded docs and current app data.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300",
          isOpen ? "bg-red-500 text-white rotate-90" : "bg-theme-primary text-white"
        )}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}
