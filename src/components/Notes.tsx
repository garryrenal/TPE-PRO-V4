import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  ChevronLeft,
  Share2,
  StickyNote,
  Search,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { cn } from '../lib/utils';
import MDEditor from '@uiw/react-md-editor';

interface Note {
  id?: string;
  userId: string;
  title: string;
  content: string;
  createdAt: any;
  updatedAt: any;
}

interface NotesProps {
  onBack: () => void;
}

export default function Notes({ onBack }: NotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: '', content: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note));
      setNotes(docs);
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'notes');
      setError("Failed to load notes. Check security rules.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!auth.currentUser || !formData.title.trim() || !formData.content.trim()) return;
    
    // Firestore document limit is 1MB. Set a safe limit of ~900KB for the content.
    if (formData.content.length > 900000) {
      setError("Note is too large. Please reduce the size of pasted images or text to save.");
      return;
    }
    
    try {
      const dataToSave = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        userId: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'notes', editingId), dataToSave);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'notes'), {
          ...dataToSave,
          createdAt: serverTimestamp(),
        });
      }

      setIsAdding(false);
      setFormData({ title: '', content: '' });
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save note.");
    }
  };

  const handleDeleteClick = (id: string) => {
    setNoteToDelete(id);
  };

  const confirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      await deleteDoc(doc(db, 'notes', noteToDelete));
      setNoteToDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete note.");
      setNoteToDelete(null);
    }
  };

  const handleEdit = (note: Note) => {
    setFormData({ title: note.title, content: note.content });
    setEditingId(note.id!);
    setIsAdding(true);
  };

  const handleShare = async (note: Note) => {
    const textToShare = `${note.title}\n\n${note.content}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: note.title,
          text: textToShare,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(textToShare);
        setToastMessage('Note copied to clipboard!');
        setTimeout(() => setToastMessage(null), 3000);
      } catch (err) {
        console.error("Failed to copy:", err);
        setToastMessage('Failed to copy note.');
        setTimeout(() => setToastMessage(null), 3000);
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setFormData(prev => ({
            ...prev,
            content: prev.content + `\n![Pasted Image](${base64})\n`
          }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-theme-card rounded-xl transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-theme-text" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-theme-primary/10 rounded-xl text-theme-primary">
              <StickyNote className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-theme-text">Notes</h1>
          </div>
        </div>
        
        {!isAdding && (
          <button
            onClick={() => {
              setFormData({ title: '', content: '' });
              setEditingId(null);
              setIsAdding(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-theme-primary text-white rounded-xl font-bold shadow-lg shadow-theme-primary/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">New Note</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm font-medium">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {isAdding ? (
          <motion.div
            key="editor"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-theme-card border border-theme-card-border rounded-3xl overflow-hidden shadow-xl"
          >
            <div className="p-4 sm:p-6 border-b border-theme-card-border flex justify-between items-center bg-theme-primary/5">
              <h2 className="text-lg font-bold text-theme-text">
                {editingId ? 'Edit Note' : 'New Note'}
              </h2>
              <button 
                onClick={() => {
                  setIsAdding(false);
                  setEditingId(null);
                }}
                className="p-2 hover:bg-theme-bg rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-theme-text opacity-40" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <input
                type="text"
                placeholder="Note Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-transparent border-none text-xl font-bold text-theme-text placeholder:text-theme-text/30 focus:ring-0 p-0"
              />
              <div 
                data-color-mode="auto" 
                className="w-full rounded-2xl overflow-hidden border border-theme-card-border flex flex-col h-[60vh] min-h-[300px] max-h-[800px]"
                onPaste={handlePaste}
              >
                <MDEditor
                  value={formData.content}
                  onChange={(val) => setFormData({ ...formData, content: val || '' })}
                  height="100%"
                  preview="live"
                  className="!border-none flex-1 overflow-hidden"
                />
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-theme-card-border bg-theme-primary/5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setEditingId(null);
                }}
                className="px-6 py-2.5 rounded-xl font-bold text-theme-text hover:bg-theme-bg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.title.trim() || !formData.content.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-theme-primary text-white rounded-xl font-bold shadow-lg shadow-theme-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                <Save className="w-4 h-4" />
                Save Note
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-text opacity-40" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-theme-card border border-theme-card-border rounded-2xl pl-12 pr-4 py-4 text-theme-text focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary outline-none transition-all shadow-sm"
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-theme-primary animate-spin" />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-12 bg-theme-card rounded-3xl border border-theme-card-border border-dashed">
                <StickyNote className="w-12 h-12 text-theme-text opacity-20 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-theme-text mb-2">No notes found</h3>
                <p className="text-theme-text opacity-60 text-sm max-w-sm mx-auto">
                  {searchQuery ? "Try adjusting your search query." : "Create your first note to keep track of important information."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 sm:gap-6">
                {filteredNotes.map(note => (
                  <motion.div
                    key={note.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-theme-card border border-theme-card-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-theme-text text-lg line-clamp-1 flex-1 pr-4">
                        {note.title}
                      </h3>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleShare(note)}
                          className="p-1.5 hover:bg-theme-primary/10 text-theme-primary rounded-lg transition-colors"
                          title="Share Note"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(note)}
                          className="p-1.5 hover:bg-theme-primary/10 text-theme-primary rounded-lg transition-colors"
                          title="Edit Note"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(note.id!)}
                          className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                          title="Delete Note"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-theme-text opacity-70 text-sm mb-4 flex-1 relative overflow-hidden max-h-[100px]">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MDEditor.Markdown 
                          source={note.content} 
                          style={{ backgroundColor: 'transparent', color: 'inherit', fontSize: 'inherit' }} 
                        />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-theme-card to-transparent" />
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-theme-text opacity-40 pt-3 border-t border-theme-card-border">
                      {note.updatedAt?.toDate ? new Date(note.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {noteToDelete && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-theme-card border border-theme-card-border rounded-3xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-theme-text">Delete Note</h3>
                  <p className="text-sm text-theme-text opacity-60">This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setNoteToDelete(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-theme-text bg-theme-bg hover:bg-theme-card-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-theme-text text-theme-bg px-6 py-3 rounded-full shadow-xl font-bold text-sm"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
