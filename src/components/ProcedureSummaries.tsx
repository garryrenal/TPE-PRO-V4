import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  ChevronLeft,
  Calendar,
  Clock,
  Database,
  ArrowRight,
  AlertCircle,
  User,
  Search,
  FileText,
  Calculator,
  Share2,
  ArrowUpDown,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  Timestamp 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { cn, generateRecId } from '../lib/utils';

interface ProcedureSummary {
  id?: string;
  userId: string;
  recId?: string;
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  patientId?: string;
  date: string;
  startTime: string;
  endTime: string;
  replacedVol: number;
  acToPt: number;
  rinseback: number;
  addlVol: number;
  totalA: number;
  removedVol: number;
  acCollBag: number;
  totalB: number;
  fluidBalanceMl: number;
  fluidBalancePercent: number;
  finalPlasmaExch: number;
  bloodVolProcessed: number;
  acInfRate: number;
  createdAt: string;
  entryDate?: string;
  entryTime?: string;
}

interface ProcedureSummariesProps {
  onBack: () => void;
  prefilledData?: Partial<ProcedureSummary> | null;
  onClearPrefilled?: () => void;
}

export default function ProcedureSummaries({ onBack, prefilledData, onClearPrefilled }: ProcedureSummariesProps) {
  const [summaries, setSummaries] = useState<ProcedureSummary[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ProcedureSummary>>({
    firstName: '',
    lastName: '',
    middleInitial: '',
    recId: generateRecId(),
    date: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    patientId: '',
    replacedVol: 0,
    acToPt: 0,
    rinseback: 0,
    addlVol: 100,
    totalA: 0,
    removedVol: 0,
    acCollBag: 0,
    totalB: 0,
    fluidBalanceMl: 0,
    fluidBalancePercent: 0,
    finalPlasmaExch: 0,
    bloodVolProcessed: 0,
    acInfRate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'lastName'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredSummaries = useMemo(() => {
    let result = summaries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = summaries.filter(s => 
        (s.firstName?.toLowerCase() || '').includes(q) ||
        (s.lastName?.toLowerCase() || '').includes(q) ||
        (s.patientId?.toLowerCase() || '').includes(q) ||
        (s.recId?.toLowerCase() || '').includes(q) ||
        (s.date || '').includes(q)
      );
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(`${a.date}T${a.startTime || '00:00'}`).getTime();
        const dateB = new Date(`${b.date}T${b.startTime || '00:00'}`).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        const nameA = (a.lastName || '').toLowerCase();
        const nameB = (b.lastName || '').toLowerCase();
        if (nameA < nameB) return sortOrder === 'asc' ? -1 : 1;
        if (nameA > nameB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }, [summaries, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    if (prefilledData) {
      setFormData(prev => ({ ...prev, ...prefilledData }));
      setIsAdding(true);
      if (onClearPrefilled) onClearPrefilled();
    }
  }, [prefilledData, onClearPrefilled]);

  useEffect(() => {
    const totalA = (formData.replacedVol || 0) + 
                   (formData.acToPt || 0) + 
                   (formData.rinseback || 0) + 
                   (formData.addlVol || 0);
    
    const totalB = (formData.removedVol || 0) - 
                   (formData.acCollBag || 0);

    const fluidBalanceMl = totalA - totalB;
    
    if (totalA !== formData.totalA || 
        totalB !== formData.totalB || 
        fluidBalanceMl !== formData.fluidBalanceMl) {
      setFormData(prev => ({ ...prev, totalA, totalB, fluidBalanceMl }));
    }
  }, [formData.replacedVol, formData.acToPt, formData.rinseback, formData.addlVol, formData.removedVol, formData.acCollBag]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'procedureSummaries'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcedureSummary));
      setSummaries(docs);
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'procedureSummaries');
      setError("Failed to load summaries. Please check your connection.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  const handleSave = async (forceSave: boolean = false) => {
    if (!auth.currentUser) return;
    
    // Duplicate check for new records or when key fields change
    if (!forceSave) {
      const isDuplicate = summaries.some(s => 
        s.id !== editingId &&
        s.lastName?.toLowerCase() === formData.lastName?.toLowerCase() &&
        s.date === formData.date &&
        s.startTime === formData.startTime
      );

      if (isDuplicate) {
        setShowDuplicateWarning(true);
        return;
      }
    }

    try {
      const now = new Date();
      const entryDate = now.toISOString().split('T')[0];
      const entryTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      
      const existingSummary = editingId ? summaries.find(s => s.id === editingId) : null;

      const data = {
        ...formData,
        userId: auth.currentUser.uid,
        createdAt: existingSummary?.createdAt || now.toISOString(),
        entryDate: existingSummary?.entryDate || entryDate,
        entryTime: existingSummary?.entryTime || entryTime,
      };

      if (editingId) {
        try {
          await updateDoc(doc(db, 'procedureSummaries', editingId), data);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `procedureSummaries/${editingId}`);
        }
      } else {
        try {
          await addDoc(collection(db, 'procedureSummaries'), data);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'procedureSummaries');
        }
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({
        firstName: '',
        lastName: '',
        middleInitial: '',
        recId: generateRecId(),
        date: new Date().toISOString().split('T')[0],
        startTime: '',
        endTime: '',
        patientId: '',
        replacedVol: 0,
        acToPt: 0,
        rinseback: 0,
        addlVol: 100,
        totalA: 0,
        removedVol: 0,
        acCollBag: 0,
        totalB: 0,
        fluidBalanceMl: 0,
        fluidBalancePercent: 0,
        finalPlasmaExch: 0,
        bloodVolProcessed: 0,
        acInfRate: 0,
      });
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save summary.");
    }
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showSpreadsheetPreview, setShowSpreadsheetPreview] = useState(false);

  const spreadsheetGrid = useMemo(() => [
    ['Replaced Vol :', formData.replacedVol, 'Removed Vol :', formData.removedVol, 'Pt. Fluid Bal (A-B)= :', `${formData.fluidBalanceMl} mL`],
    ['AC to pt :', formData.acToPt, '- AC coll bag :', formData.acCollBag, 'Fluid Balance :', `${formData.fluidBalancePercent}%`],
    ['Rinseback :', formData.rinseback, '', '', 'Final Plasma Exch :', formData.finalPlasmaExch],
    ['Add\'l Vol :', formData.addlVol, '', '', 'Blood Vol Processed :', `${formData.bloodVolProcessed} mL`],
    ['Total: (A)', formData.totalA, 'Total: (B)', formData.totalB, 'AC Inf. Rate :', `${formData.acInfRate} mL/min/L`]
  ], [formData]);

  const copyToSpreadsheet = () => {
    const tsv = spreadsheetGrid.map(row => row.join('\t')).join('\n');
    
    navigator.clipboard.writeText(tsv).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'procedureSummaries', id));
      setIsDeleting(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `procedureSummaries/${id}`);
      setError("Failed to delete summary.");
    }
  };

  const exportToCSV = () => {
    if (summaries.length === 0) return;

    const headers = [
      'Record ID', 'First Name', 'Last Name', 'MI', 'Patient ID', 'Date', 'Start Time', 'End Time',
      'Replaced Vol (mL)', 'AC to Pt (mL)', 'Rinseback (mL)', 'Addl Vol (mL)', 'Total A (mL)',
      'Removed Vol (mL)', 'AC Coll Bag (mL)', 'Total B (mL)',
      'Fluid Balance (mL)', 'Fluid Balance (%)', 'Final Plasma Exch',
      'Blood Vol Processed (mL)', 'AC Inf Rate', 'Entry Date', 'Entry Time'
    ];

    const csvRows = summaries.map(s => [
      s.recId || '',
      s.firstName || '',
      s.lastName || '',
      s.middleInitial || '',
      s.patientId || '',
      s.date || '',
      s.startTime || '',
      s.endTime || '',
      s.replacedVol || 0,
      s.acToPt || 0,
      s.rinseback || 0,
      s.addlVol || 0,
      s.totalA || 0,
      s.removedVol || 0,
      s.acCollBag || 0,
      s.totalB || 0,
      s.fluidBalanceMl || 0,
      s.fluidBalancePercent || 0,
      s.finalPlasmaExch || 0,
      s.bloodVolProcessed || 0,
      s.acInfRate || 0,
      s.entryDate || '',
      s.entryTime || ''
    ].map(val => `"${val}"`).join(','));

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Procedure_Summaries_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startEdit = (summary: ProcedureSummary) => {
    setFormData(summary);
    setEditingId(summary.id!);
    setIsAdding(true);
  };

  const handleSharePDF = (summary: ProcedureSummary) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105); // theme-primary color
    doc.text('TPE Procedure Summary', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    
    // Patient Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Patient Information', 14, 45);
    
    autoTable(doc, {
      startY: 50,
      head: [['Field', 'Value']],
      body: [
        ['Name', `${summary.firstName} ${summary.lastName} ${summary.middleInitial ? `${summary.middleInitial}.` : ''}`],
        ['Patient ID', summary.patientId || 'N/A'],
        ['Date', summary.date],
        ['Start Time', summary.startTime || 'N/A'],
        ['End Time', summary.endTime || 'N/A'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105] },
    });
    
    // Procedure Data
    const finalY = (doc as any).lastAutoTable.finalY || 50;
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Procedure Data', 14, finalY + 15);
    
    autoTable(doc, {
      startY: finalY + 20,
      head: [
        [
          { content: 'REPLACED', styles: { textColor: [5, 150, 105], fontStyle: 'bold', fontSize: 10 } },
          { content: 'REMOVED', styles: { textColor: [220, 38, 38], fontStyle: 'bold', fontSize: 10 } },
          { content: 'PT. FLUID BAL', styles: { textColor: [37, 99, 235], fontStyle: 'bold', fontSize: 10 } }
        ]
      ],
      body: [
        // Row 1
        [
          { content: 'REPLACED VOL', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } },
          { content: 'REMOVED VOL', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } },
          { content: 'FLUID BALANCE', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } }
        ],
        [
          { content: `${summary.replacedVol} mL`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } },
          { content: `${summary.removedVol} mL`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } },
          { content: `${summary.fluidBalanceMl} mL`, styles: { fontSize: 10, fontStyle: 'bold', textColor: [37, 99, 235], cellPadding: [0, 2, 2, 2] } }
        ],
        // Row 2
        [
          { content: 'AC TO PT', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } },
          { content: 'AC COLL BAG', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } },
          { content: 'FLUID BALANCE', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } }
        ],
        [
          { content: `${summary.acToPt} mL`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } },
          { content: `${summary.acCollBag} mL`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } },
          { content: `${summary.fluidBalancePercent}%`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } }
        ],
        // Row 3
        [
          { content: 'RINSEBACK', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } },
          { content: 'TOTAL (B)', styles: { fontSize: 7, textColor: [220, 38, 38], cellPadding: [2, 2, 0, 2] } },
          { content: 'FINAL PLASMA EXCH', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } }
        ],
        [
          { content: `${summary.rinseback} mL`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } },
          { content: `${summary.totalB} mL`, styles: { fontSize: 10, fontStyle: 'bold', textColor: [220, 38, 38], cellPadding: [0, 2, 2, 2] } },
          { content: `${summary.finalPlasmaExch}`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } }
        ],
        // Row 4
        [
          { content: 'ADD\'L VOL', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } },
          '',
          { content: 'BLOOD VOL PROCESSED', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } }
        ],
        [
          { content: `${summary.addlVol} mL`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } },
          '',
          { content: `${summary.bloodVolProcessed} mL`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } }
        ],
        // Row 5
        [
          { content: 'TOTAL (A)', styles: { fontSize: 7, textColor: [5, 150, 105], cellPadding: [2, 2, 0, 2] } },
          '',
          { content: 'AC INF. RATE', styles: { fontSize: 7, textColor: 150, cellPadding: [2, 2, 0, 2] } }
        ],
        [
          { content: `${summary.totalA} mL`, styles: { fontSize: 10, fontStyle: 'bold', textColor: [5, 150, 105], cellPadding: [0, 2, 2, 2] } },
          '',
          { content: `${summary.acInfRate} mL/min/L`, styles: { fontSize: 10, fontStyle: 'bold', cellPadding: [0, 2, 2, 2] } }
        ]
      ],
      theme: 'plain',
      styles: { cellPadding: 1 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 60 },
        2: { cellWidth: 60 }
      }
    });
    
    doc.save(`TPE_Summary_${summary.patientId || 'NoID'}_${summary.date}.pdf`);
  };

  const handleShareGridPDF = (summary: ProcedureSummary) => {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for grid
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(0); // Removed green
    doc.text('TPE Procedure Summary (Grid View)', 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Patient: ${summary.firstName} ${summary.lastName} ${summary.middleInitial ? `${summary.middleInitial}.` : ''} | Rec ID: ${summary.recId} | Date: ${summary.date}`, 14, 22);

    autoTable(doc, {
      startY: 30,
      head: [
        [
          { content: 'REPLACED', styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0 } },
          { content: 'AMT', styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0 } },
          { content: 'REMOVED', styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0 } },
          { content: 'AMT', styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0 } },
          { content: '', styles: { fillColor: [240, 240, 240] } },
          { content: '', styles: { fillColor: [240, 240, 240] } }
        ]
      ],
      body: [
        [
          'Replaced Vol :', { content: summary.replacedVol },
          'Removed Vol :', { content: summary.removedVol },
          'Pt. Fluid Bal (A-B)= :', { content: `${summary.fluidBalanceMl} mL`, styles: { fontStyle: 'bold' } }
        ],
        [
          '+ AC to pt :', { content: summary.acToPt },
          '- AC coll bag :', { content: summary.acCollBag },
          'Fluid Balance :', { content: `${summary.fluidBalancePercent}%` }
        ],
        [
          '+ Rinseback :', { content: summary.rinseback },
          '', '',
          'Final Plasma Exch :', { content: `${summary.finalPlasmaExch}` }
        ],
        [
          '+ Add\'l Vol :', { content: summary.addlVol },
          '', '',
          'Blood Vol Processed :', { content: `${summary.bloodVolProcessed} mL` }
        ],
        [
          { content: 'Total: (A)', styles: { halign: 'right', fontStyle: 'bold' } },
          { content: summary.totalA, styles: { fontStyle: 'bold' } },
          { content: 'Total: (B)', styles: { halign: 'right', fontStyle: 'bold' } },
          { content: summary.totalB, styles: { fontStyle: 'bold' } },
          'AC Inf. Rate :', { content: `${summary.acInfRate} mL/min/L` }
        ]
      ],
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 3,
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 40, halign: 'right' },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 60, halign: 'right' },
        5: { cellWidth: 40, halign: 'right' },
      }
    });

    doc.save(`TPE_Grid_${summary.recId || 'NoID'}_${summary.date}.pdf`);
  };

  const renderField = (label: string, key: keyof ProcedureSummary, type: 'number' | 'text' | 'date' | 'time' = 'number', readOnly: boolean = false) => (
    <div className="space-y-1">
      <label className="text-[10px] font-black uppercase tracking-widest text-theme-text opacity-40 px-1">{label}</label>
      <input
        type={type}
        value={(formData as any)[key] || (type === 'number' ? 0 : '')}
        onChange={(e) => !readOnly && setFormData({ ...formData, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
        readOnly={readOnly}
        className={cn(
          "w-full bg-theme-bg border border-theme-card-border rounded-xl px-3 py-2 text-sm outline-none transition-all",
          readOnly ? "bg-theme-primary/5 border-theme-primary/20 font-bold text-theme-primary cursor-default" : "focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary"
        )}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-theme-bg pb-20">
      {/* Header */}
      <header className="p-6 bg-theme-primary text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Procedure Summaries</h1>
              <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Calculated Totals & Balances</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6">
        <AnimatePresence mode="wait">
          {isAdding ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-theme-card rounded-3xl shadow-xl border border-theme-card-border overflow-hidden"
            >
              <div className="p-6 border-b border-theme-card-border flex items-center justify-between bg-theme-primary-bg/30">
                <div className="flex items-center gap-3">
                  <div className="bg-theme-primary/10 p-2 rounded-xl">
                    <FileText className="w-5 h-5 text-theme-primary" />
                  </div>
                  <h2 className="font-bold text-theme-text">{editingId ? 'Edit Summary' : 'Create New Summary'}</h2>
                </div>
                <button onClick={() => { setIsAdding(false); setEditingId(null); setFormData({}); }} className="p-2 hover:bg-theme-bg rounded-xl transition-colors">
                  <X className="w-5 h-5 text-theme-text opacity-40" />
                </button>
              </div>

              <div className="p-6 space-y-8">
                {/* Basic Info */}
                <div className="grid grid-cols-1 gap-4 bg-theme-primary/5 p-4 rounded-2xl border border-theme-primary-border/30">
                  {renderField('Rec ID', 'recId', 'text', true)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-theme-primary/5 p-4 rounded-2xl border border-theme-primary-border/30">
                  {renderField('Date', 'date', 'date', true)}
                  {renderField('Start Time', 'startTime', 'text', true)}
                  {renderField('End Time', 'endTime', 'text', true)}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* REPLACED Section */}
                  <div className="space-y-4 p-5 bg-theme-bg/50 rounded-2xl border border-theme-card-border">
                    <h3 className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      Replaced
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                      {renderField('Replaced Vol', 'replacedVol', 'number', true)}
                      {renderField('AC to pt', 'acToPt', 'number', true)}
                      {renderField('Rinseback', 'rinseback', 'number', true)}
                      {renderField('Add\'l Vol', 'addlVol')}
                      <div className="pt-2 border-t border-theme-card-border sm:col-span-2 lg:col-span-1">
                        {renderField('Total (A)', 'totalA', 'number', true)}
                      </div>
                    </div>
                  </div>

                  {/* REMOVED Section */}
                  <div className="space-y-4 p-5 bg-theme-bg/50 rounded-2xl border border-theme-card-border">
                    <h3 className="text-xs font-black uppercase tracking-widest text-red-600 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      Removed
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                      {renderField('Removed Vol', 'removedVol', 'number', true)}
                      {renderField('AC coll bag', 'acCollBag', 'number', true)}
                      <div className="pt-2 border-t border-theme-card-border sm:col-span-2 lg:col-span-1">
                        {renderField('Total (B)', 'totalB', 'number', true)}
                      </div>
                    </div>
                  </div>

                  {/* BALANCE Section */}
                  <div className="space-y-4 p-5 bg-theme-bg/50 rounded-2xl border border-theme-card-border">
                    <h3 className="text-xs font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      Pt. Fluid Bal
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                      {renderField('Fluid Balance (mL)', 'fluidBalanceMl', 'number', true)}
                      {renderField('Fluid Balance (%)', 'fluidBalancePercent', 'number', true)}
                      {renderField('Final Plasma Exch', 'finalPlasmaExch', 'number', true)}
                      {renderField('Blood Vol Processed', 'bloodVolProcessed', 'number', true)}
                      {renderField('AC Inf. Rate (mL/min/L)', 'acInfRate')}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowSpreadsheetPreview(!showSpreadsheetPreview)}
                      className="text-[10px] font-black uppercase tracking-widest text-theme-primary hover:underline"
                    >
                      {showSpreadsheetPreview ? 'Hide Spreadsheet Preview' : 'Show Spreadsheet Preview'}
                    </button>
                    <button
                      onClick={copyToSpreadsheet}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                        isCopied 
                          ? "bg-theme-primary text-white border-theme-primary" 
                          : "bg-theme-bg text-theme-text opacity-60 hover:opacity-100 border-theme-card-border"
                      )}
                    >
                      {isCopied ? (
                        <>
                          <Save className="w-3 h-3" />
                          COPIED!
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3 h-3" />
                          Copy for Spreadsheet
                        </>
                      )}
                    </button>
                  </div>

                  {showSpreadsheetPreview && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-4 bg-theme-bg border border-theme-card-border rounded-2xl overflow-x-auto"
                    >
                      <div className="grid grid-cols-6 gap-0 border-t border-l border-theme-card-border min-w-[600px]">
                        {spreadsheetGrid.flat().map((cell, i) => (
                          <div key={i} className="border-r border-b border-theme-card-border p-2 text-[9px] font-medium text-theme-text min-h-[32px] flex items-center justify-end bg-white/50 text-right">
                            {cell}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[9px] text-theme-text opacity-40 italic">
                        * Data above will be copied in tab-separated format for direct pasting into Excel/Sheets.
                      </p>
                    </motion.div>
                  )}
                </div>

                <button 
                  onClick={() => handleSave()}
                  className="w-full py-4 bg-theme-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-theme-primary/20 hover:scale-[1.01] active:scale-95 transition-all"
                >
                  <Save className="w-5 h-5" />
                  {editingId ? 'Update Summary' : 'Save Summary'}
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
              {/* Search & Sort Bar */}
              {!isLoading && summaries.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative group flex-1">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                      <Search className="w-5 h-5 text-theme-text opacity-20 group-focus-within:text-theme-primary group-focus-within:opacity-100 transition-all" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search by ID # or date..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-theme-card-bg border border-theme-card-border rounded-3xl py-5 pl-14 pr-6 text-theme-text placeholder:text-theme-text placeholder:opacity-20 focus:outline-none focus:ring-4 focus:ring-theme-primary/10 transition-all shadow-xl shadow-theme-primary/5"
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-theme-card-bg border border-theme-card-border rounded-3xl px-4 py-2 shadow-xl shadow-theme-primary/5">
                    <button 
                      onClick={exportToCSV}
                      className="p-2 hover:bg-theme-primary-bg rounded-xl text-theme-primary transition-colors flex items-center gap-2 group/export"
                      title="Export to CSV"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Export</span>
                    </button>
                    <div className="w-px h-4 bg-theme-card-border mx-1" />
                    <ArrowUpDown className="w-4 h-4 text-theme-primary" />
                    <select 
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-transparent text-xs font-bold text-theme-text focus:outline-none appearance-none cursor-pointer pr-2"
                    >
                      <option value="date">Date</option>
                      <option value="lastName">Last Name</option>
                    </select>
                    <button 
                      onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="text-[10px] font-black uppercase tracking-widest text-theme-primary hover:opacity-70 transition-opacity"
                    >
                      {sortOrder}
                    </button>
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-theme-text opacity-40">
                  <Database className="w-12 h-12 animate-pulse mb-4" />
                  <p className="font-bold uppercase tracking-widest text-xs">Loading Summaries...</p>
                </div>
              ) : summaries.length === 0 ? (
                <div className="bg-theme-card rounded-3xl p-12 text-center border border-theme-card-border shadow-xl">
                  <div className="w-20 h-20 bg-theme-primary-bg rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-10 h-10 text-theme-primary opacity-40" />
                  </div>
                  <h3 className="text-xl font-bold text-theme-text mb-2">No Summaries Found</h3>
                  <p className="text-theme-text opacity-60 max-w-xs mx-auto mb-8">
                    Summaries are automatically generated when you add a new TPE Record.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredSummaries.map((s) => (
                    <motion.div
                      layout
                      key={s.id}
                      className="bg-theme-card rounded-3xl p-3.5 border border-theme-card-border shadow-md hover:shadow-xl transition-all group"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-3">
                          <div className="bg-theme-primary-bg p-2 rounded-2xl">
                            <FileText className="w-5 h-5 text-theme-primary" />
                          </div>
                          <div>
                            <h4 className="font-black text-theme-text text-sm">
                              {s.recId && <span className="text-theme-primary mr-1">[{s.recId}]</span>}
                              {(s.firstName || s.lastName) ? `${s.lastName}, ${s.firstName} ${s.middleInitial ? `${s.middleInitial}.` : ''}` : 'No Name'}
                              {s.patientId && <span className="ml-1 text-[9px] opacity-40">PID#{s.patientId}</span>}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-theme-text opacity-40 uppercase tracking-widest">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {s.date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {s.startTime || '--:--'} - {s.endTime || '--:--'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {isDeleting === s.id ? (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleDelete(s.id!)}
                                className="px-2 py-1 bg-red-500 text-white text-[9px] font-bold rounded-lg hover:bg-red-600 transition-colors"
                              >
                                CONFIRM
                              </button>
                              <button 
                                onClick={() => setIsDeleting(null)}
                                className="px-2 py-1 bg-theme-bg text-theme-text text-[9px] font-bold rounded-lg hover:bg-theme-card-border transition-colors"
                              >
                                CANCEL
                              </button>
                            </div>
                          ) : (
                            <>
                              <button 
                                onClick={() => handleSharePDF(s)}
                                className="p-1.5 hover:bg-theme-bg rounded-xl text-blue-500 transition-colors group/btn relative"
                                title="Share as List PDF"
                              >
                                <Share2 className="w-4 h-4" />
                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-theme-text text-theme-bg text-[9px] px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">List PDF</span>
                              </button>
                              <button 
                                onClick={() => handleShareGridPDF(s)}
                                className="p-1.5 hover:bg-theme-primary-bg rounded-xl text-theme-primary transition-colors group/btn relative"
                                title="Share as Grid PDF"
                              >
                                <Calculator className="w-4 h-4" />
                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-theme-text text-theme-bg text-[9px] px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Grid PDF</span>
                              </button>
                              <button 
                                onClick={() => startEdit(s)}
                                className="p-1.5 hover:bg-theme-bg rounded-xl text-theme-primary transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setIsDeleting(s.id!)}
                                className="p-1.5 hover:bg-red-50 rounded-xl text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-theme-card-border pt-2.5">
                        <div className="text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600 opacity-60 mb-0.5">Total (A)</p>
                          <p className="font-bold text-emerald-600 text-sm">{s.totalA} <span className="text-[9px] opacity-40">mL</span></p>
                        </div>
                        <div className="text-center border-l sm:border-x border-theme-card-border">
                          <p className="text-[8px] font-black uppercase tracking-widest text-red-600 opacity-60 mb-0.5">Total (B)</p>
                          <p className="font-bold text-red-600 text-sm">{s.totalB} <span className="text-[9px] opacity-40">mL</span></p>
                        </div>
                        <div className="text-center border-l sm:border-r border-theme-card-border">
                          <p className="text-[8px] font-black uppercase tracking-widest text-blue-600 opacity-60 mb-0.5">Fluid Bal</p>
                          <p className="font-bold text-blue-600 text-sm">{s.fluidBalanceMl} <span className="text-[9px] opacity-40">mL</span></p>
                          <p className="text-[8px] font-bold text-blue-500/60">{s.fluidBalancePercent}%</p>
                        </div>
                        <div className="text-center border-l sm:border-0 border-theme-card-border">
                          <p className="text-[8px] font-black uppercase tracking-widest text-theme-text opacity-40 mb-0.5">Exch / Blood</p>
                          <p className="font-bold text-theme-text text-[10px]">Exch: {s.finalPlasmaExch}</p>
                          <p className="text-[8px] opacity-40 font-bold">Blood: {s.bloodVolProcessed} mL</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {showDuplicateWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-theme-card border border-theme-card-border rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-theme-text mb-2">Duplicate Entry?</h3>
            <p className="text-sm text-theme-text opacity-60 mb-8">
              A record with the same <strong>Last Name</strong>, <strong>Date</strong>, and <strong>Start Time</strong> already exists. Please verify if this is a new entry.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  setShowDuplicateWarning(false);
                  handleSave(true);
                }}
                className="w-full py-4 bg-theme-primary text-white rounded-2xl font-bold shadow-lg shadow-theme-primary/20 transition-all active:scale-95"
              >
                Yes, Save Anyway
              </button>
              <button 
                onClick={() => setShowDuplicateWarning(false)}
                className="w-full py-4 bg-theme-bg text-theme-text border border-theme-card-border rounded-2xl font-bold transition-all active:scale-95"
              >
                No, Let Me Check
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-24 left-4 right-4 z-50">
          <div className="bg-red-500 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <p className="text-sm font-bold">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-white/20 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
