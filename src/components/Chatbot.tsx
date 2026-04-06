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
  User as UserIcon,
  Globe,
  Bookmark
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

interface SavedWebKnowledge {
  query: string;
  answer: string;
  sources: string[];
  timestamp: number;
}

export function Chatbot({ appData, theme }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSavedKnowledge, setShowSavedKnowledge] = useState(false);
  
  const [savedWebKnowledge, setSavedWebKnowledge] = useState<SavedWebKnowledge[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tpe-web-knowledge');
      if (saved) return JSON.parse(saved);
    }
    return [];
  });

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
      const relevantChunks = await retrieveRelevantChunks(ai.current, userMessage, documents, 12);
      const docContext = relevantChunks.map(c => `[Source Document: ${c.docName}]\n${c.text}`).join('\n\n---\n\n');
      
      const baseKnowledgeContext = `
        CORE DOCUMENTS (Base Knowledge):
        1. ASFA 2023 Guidelines: ${KNOWLEDGE_BASE.asfa2023}
        2. Preceptor Guide: ${KNOWLEDGE_BASE.preceptorGuide}
      `;
      
      const appStateContext = `
        Current App Mode: ${appData.calcMode}
        Patient Data: ${JSON.stringify(appData.patientData)}
        Current Stats: ${JSON.stringify(appData.stats)}
        Active Scenario: ${appData.activeScenario || 'None'}
      `;

      const savedKnowledgeContext = savedWebKnowledge.length > 0 
        ? `\nPREVIOUSLY SAVED WEB SEARCHES (Available Offline):\n${savedWebKnowledge.map(k => `Q: ${k.query}\nA: ${k.answer}`).join('\n\n')}`
        : '';

      const systemInstruction = `
        You are an Apheresis Specialist Assistant. 
        Your primary source of information is the CORE DOCUMENTS provided below. 
        You also have access to relevant chunks from user-uploaded documents.
        If the answer is not in the documents, but relates to the current application data, use the application data.
        If neither contains the answer, use the Google Search tool to find the information on the web.
        
        CORE DOCUMENTS:
        ${baseKnowledgeContext}

        Current Application Data:
        ${appStateContext}
        
        Relevant User Uploaded Documents Context:
        ${docContext || 'No relevant documents found.'}
        ${savedKnowledgeContext}
        
        Rules:
        1. Prioritize provided documents (Core + Uploaded) and application data.
        2. If the information is missing, use Google Search.
        3. Be concise and professional.
        4. Use Markdown for formatting.
        5. If asked about calculations, refer to the current stats provided in the context.
      `;

      const chat = ai.current.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      const response = await chat.sendMessage({ 
        message: userMessage 
      });

      const responseText = response.text || "I'm sorry, I couldn't generate a response.";
      
      // Check if web search was used
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const webChunks = groundingChunks?.filter((c: any) => c.web?.uri) || [];
      
      if (webChunks.length > 0) {
        const newKnowledge: SavedWebKnowledge = {
          query: userMessage,
          answer: responseText,
          sources: webChunks.map((c: any) => c.web.uri),
          timestamp: Date.now()
        };
        setSavedWebKnowledge(prev => {
          const updated = [...prev, newKnowledge];
          localStorage.setItem('tpe-web-knowledge', JSON.stringify(updated));
          return updated;
        });
      }

      setMessages(prev => [...prev, { role: 'model', content: responseText }]);
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
    <div className={cn("fixed bottom-6 right-6 z-[100] flex flex-col items-end", theme)} data-theme={theme}>
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
                  onClick={() => setShowSavedKnowledge(!showSavedKnowledge)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors flex items-center gap-1",
                    showSavedKnowledge ? "bg-white/20" : "hover:bg-white/10"
                  )}
                  title="Saved Web Knowledge"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
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

            {/* Main Content Area */}
            {showSavedKnowledge ? (
              <div className="flex-1 overflow-y-auto p-4 bg-theme-bg custom-scrollbar">
                <div className="flex items-center gap-2 mb-4 text-theme-primary">
                  <Globe className="w-5 h-5" />
                  <h4 className="font-bold">Saved Web Knowledge</h4>
                </div>
                {savedWebKnowledge.length === 0 ? (
                  <p className="text-sm text-theme-text/60 text-center mt-10">
                    No web knowledge saved yet. When the bot searches the web for answers, they will be saved here for offline access.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {savedWebKnowledge.map((item, idx) => (
                      <div key={idx} className="bg-theme-card border border-theme-card-border p-4 rounded-xl shadow-sm">
                        <p className="font-semibold text-sm text-theme-text mb-2">Q: {item.query}</p>
                        <div className="prose prose-sm max-w-none prose-p:text-theme-text prose-headings:text-theme-text prose-strong:text-theme-text prose-li:text-theme-text prose-a:text-theme-primary mb-3">
                          <Markdown>{item.answer}</Markdown>
                        </div>
                        {item.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-theme-card-border">
                            <p className="text-[10px] font-semibold text-theme-text/40 uppercase mb-1">Sources</p>
                            <div className="flex flex-wrap gap-1">
                              {item.sources.map((src, i) => (
                                <a key={i} href={src} target="_blank" rel="noreferrer" className="text-[10px] text-theme-primary hover:underline truncate max-w-[150px] block">
                                  {new URL(src).hostname}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Documents Bar */}
                {documents.length > 0 && (
                  <div className="px-4 py-2 bg-theme-primary/5 border-b border-theme-card-border flex gap-2 overflow-x-auto no-scrollbar">
                    {documents.map((doc, i) => (
                      <div 
                        key={i}
                        className="flex items-center gap-1.5 bg-theme-card border border-theme-card-border px-2 py-1 rounded-lg shrink-0"
                      >
                        <FileText className="w-3 h-3 text-theme-primary" />
                        <span className="text-[10px] font-medium text-theme-text max-w-[80px] truncate">{doc.name}</span>
                        <button 
                          onClick={() => removeDocument(i)}
                          className="hover:text-red-500 transition-colors text-theme-text/60"
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
                        m.role === 'user' ? "bg-theme-primary text-white" : "bg-theme-primary/10 text-theme-primary"
                      )}>
                        {m.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={cn(
                        "max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed",
                        m.role === 'user' 
                          ? "bg-theme-primary text-white rounded-tr-none" 
                          : "bg-theme-card text-theme-text border border-theme-card-border rounded-tl-none"
                      )}>
                        <div className="prose prose-sm max-w-none prose-p:text-theme-text prose-headings:text-theme-text prose-strong:text-theme-text prose-li:text-theme-text prose-a:text-theme-primary">
                          <Markdown>
                            {m.content}
                          </Markdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-xl bg-theme-primary/10 text-theme-primary flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-theme-card border border-theme-card-border p-3 rounded-2xl rounded-tl-none">
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
                      className="p-2 text-theme-text/40 hover:text-theme-primary transition-colors disabled:opacity-50"
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
                      className="flex-1 bg-theme-card border border-theme-card-border text-theme-text rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition-all placeholder:text-theme-text/40"
                    />
                    <button 
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className="p-2 bg-theme-primary text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[9px] text-theme-text/40 mt-2 text-center">
                    Answers based on uploaded docs, app data, and web search.
                  </p>
                </div>
              </>
            )}
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
