import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Camera as CameraIcon, 
  ChevronLeft,
  Calendar,
  Clock,
  Database,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  User,
  Search,
  Upload,
  Loader2,
  RotateCcw,
  Image as ImageIcon,
  ArrowUpDown,
  Download,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  doc, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { cn, generateRecId } from '../lib/utils';
import { calculateTBV, PatientData } from '../lib/calculations';
import CameraOCR from './CameraOCR';
import ReviewOCR from './ReviewOCR';
import PatientsModal, { Patient } from './PatientsModal';

interface TPERecord {
  id?: string;
  userId: string;
  recId?: string;
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  patientId?: string;
  date: string;
  time?: string;
  acUsed?: number;
  removeBag?: number;
  replacementUsed?: number;
  bolus?: number;
  tubingSet?: number;
  rinseback?: number;
  startTime?: string;
  endTime?: string;
  runTime?: number;
  fluidBalanceMl?: number;
  fluidBalancePercent?: number;
  inletProcessed?: number;
  plasmaVolumesExchanged?: number;
  plasmaRemoved?: number;
  acInRemoveBag?: number;
  acToPatient?: number;
  acUsedForPrime?: number;
  salineToPatientAir?: number;
  customPrime?: number;
  salineRinse?: number;
  sex?: string;
  ht?: number;
  wt?: number;
  hct?: number;
  createdAt: string;
  entryDate?: string;
  entryTime?: string;
}

interface RecordsProps {
  onBack: () => void;
  onUseRecord?: (record: TPERecord) => void;
  patientData?: {
    sex: string;
    height: number;
    weight: number;
    hct: number;
  };
}

export default function Records({ onBack, onUseRecord, patientData }: RecordsProps) {
  const [records, setRecords] = useState<TPERecord[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [hasCapturedData, setHasCapturedData] = useState(false);
  const [formData, setFormData] = useState<Partial<TPERecord>>({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    recId: generateRecId(),
    firstName: '',
    lastName: '',
    middleInitial: '',
    patientId: '',
    sex: '',
    ht: undefined,
    wt: undefined,
    hct: undefined,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'lastName'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isUploading, setIsUploading] = useState(false);
  const [showPatientsModal, setShowPatientsModal] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const tempCalculations = useMemo(() => {
    const { sex, ht, wt, hct } = formData;
    if (!sex || !ht || !wt) return { tbv: 0, pv: 0 };

    const patient: PatientData = {
      sex: sex.toLowerCase().startsWith('m') ? 'male' : 'female',
      height: ht,
      heightUnit: 'cm',
      weight: wt,
      weightUnit: 'kg',
      hct: hct || 0
    };

    const tbv = calculateTBV(patient);
    const rcv = tbv * ((hct || 0) / 100);
    const pv = tbv - rcv;

    return {
      tbv: Math.round(tbv),
      pv: Math.round(pv)
    };
  }, [formData.sex, formData.ht, formData.wt, formData.hct]);

  const filteredRecords = useMemo(() => {
    let result = records;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = records.filter(record => {
        const nameMatch = (record.firstName?.toLowerCase() || '').includes(query) || 
                          (record.lastName?.toLowerCase() || '').includes(query);
        const idMatch = (record.patientId?.toLowerCase() || '').includes(query) ||
                        (record.recId?.toLowerCase() || '').includes(query);
        const dateMatch = (record.date || '').includes(query);
        return nameMatch || idMatch || dateMatch;
      });
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
        const dateB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        const nameA = (a.lastName || '').toLowerCase();
        const nameB = (b.lastName || '').toLowerCase();
        if (nameA < nameB) return sortOrder === 'asc' ? -1 : 1;
        if (nameA > nameB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }, [records, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'records'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TPERecord));
      setRecords(docs);
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'records');
      setError("Failed to load records. Check security rules.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleCapture = (data: any) => {
    setHasCapturedData(true);
    // Merge extracted data with current form data
    setFormData(prev => {
      const next = { ...prev };
      Object.keys(data).forEach(key => {
        if (data[key] !== null && data[key] !== undefined) {
          let value = data[key];
          if (key === 'date' && typeof value === 'string') {
            // Normalize MM-DD-YYYY or MM/DD/YYYY to YYYY-MM-DD
            const match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (match) {
              const [_, m, d, y] = match;
              value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
          }
          (next as any)[key] = value;
        }
      });
      return next;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const fileParts = await Promise.all(files.map(async (file) => {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return {
          inlineData: {
            mimeType: file.type,
            data: base64,
          },
        };
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              ...fileParts,
              {
                text: `Extract TPE procedure data from the provided Spectra Optia screen image.
                Return a JSON object with all found fields. Use null if a field is not found.
                
                Image Layout Guide:
                - The red box (left column) contains the field names.
                - The green box (middle column) contains the final values for those fields.
                - The blue box inside the green box (e.g., "(AC 260)") is "AC in Remove Bag (mL)".
                - The blue box on the top right with "AC" is "AC Used (mL)".
                - The blue box on the bottom right is "AC to patient: X mL" which is "AC to Patient (mL)".
                - Other blue boxes on the right include "Rinseback" and "Bolus".
                - The blue box on the very top right has the "Date", "Start Time" (first time), and "End Time" (second time).
                - The blue box in the top middle (below "Software version") contains "Sex", "Height", "Weight", and "Hct".

                Fields to extract:
                - date: string (Format: MM-DD-YYYY from the top right box)
                - startTime: string (Format: HH:mm from the top right box, the first time listed)
                - endTime: string (Format: HH:mm from the top right box, the second time listed)
                - acUsed: number (From the top right blue box labeled AC)
                - removeBag: number (From the green box row for "Remove Bag (mL)")
                - replacementUsed: number (From the green box row for "Replacement Used (mL)")
                - bolus: number (From the blue box labeled Bolus)
                - tubingSet: number (Tubing set volume in mL)
                - rinseback: number (From the blue box labeled Rinseback)
                - runTime: number (From the green box row for "Run Time (min)")
                - fluidBalanceMl: number (From the green box row for "Fluid Balance (mL)")
                - fluidBalancePercent: number (From the green box row for "Fluid Balance (%)")
                - inletProcessed: number (From the green box row for "Inlet (mL)")
                - plasmaVolumesExchanged: number (From the green box row for "Plasma Volumes Exchanged")
                - plasmaRemoved: number (From the green box row for "Plasma Removed (mL)")
                - acInRemoveBag: number (From the blue box inside the green box)
                - acToPatient: number (From the bottom right blue box)
                - sex: string (From the top middle blue box, e.g., "M" or "F" or "Male" or "Female")
                - ht: number (Height in cm from the top middle blue box. If the image shows feet and inches like 5'8'', convert it to cm: e.g., 5*30.48 + 8*2.54 = 173. Round to nearest integer)
                - wt: number (Weight in kg from the top middle blue box)
                - hct: number (Hematocrit percentage from the top middle blue box, e.g. 39)
                
                Be extremely precise with numbers. If a number has a decimal, include it.
                Only return the JSON object.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              acUsed: { type: Type.NUMBER },
              removeBag: { type: Type.NUMBER },
              replacementUsed: { type: Type.NUMBER },
              bolus: { type: Type.NUMBER },
              tubingSet: { type: Type.NUMBER },
              rinseback: { type: Type.NUMBER },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              runTime: { type: Type.NUMBER },
              fluidBalanceMl: { type: Type.NUMBER },
              fluidBalancePercent: { type: Type.NUMBER },
              inletProcessed: { type: Type.NUMBER },
              plasmaVolumesExchanged: { type: Type.NUMBER },
              plasmaRemoved: { type: Type.NUMBER },
              acInRemoveBag: { type: Type.NUMBER },
              acToPatient: { type: Type.NUMBER },
              date: { type: Type.STRING },
              time: { type: Type.STRING },
              sex: { type: Type.STRING },
              ht: { type: Type.NUMBER },
              wt: { type: Type.NUMBER },
              hct: { type: Type.NUMBER },
            }
          }
        }
      });

      const text = response.text?.trim() || "{}";
      const extractedData = JSON.parse(text === "" ? "{}" : text);
      
      // Default additional fluid details to 0 for uploads
      extractedData.acUsedForPrime = 0;
      extractedData.salineToPatientAir = 0;
      extractedData.customPrime = 0;
      extractedData.salineRinse = 0;

      setReviewData(extractedData);
    } catch (err) {
      console.error("Upload OCR Error:", err);
      setError("Failed to process uploaded images. Please try again.");
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSave = async (createSummary: boolean = false) => {
    if (!auth.currentUser) return;
    
    try {
      const now = new Date();
      const entryDate = now.toISOString().split('T')[0];
      const entryTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      
      const existingRecord = editingId ? records.find(r => r.id === editingId) : null;

      const rawData = {
        ...formData,
        userId: auth.currentUser.uid,
        createdAt: existingRecord?.createdAt || now.toISOString(),
        entryDate: existingRecord?.entryDate || entryDate,
        entryTime: existingRecord?.entryTime || entryTime,
      };

      // Filter out undefined values to prevent Firestore errors
      const dataToSave = Object.fromEntries(
        Object.entries(rawData).filter(([_, v]) => v !== undefined)
      );

      let savedRecord = { ...dataToSave };

      if (editingId) {
        try {
          await updateDoc(doc(db, 'records', editingId), dataToSave);
          savedRecord.id = editingId;
          setEditingId(null);
          setIsAdding(false); // Return to list after update
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `records/${editingId}`);
        }
      } else {
        try {
          const docRef = await addDoc(collection(db, 'records'), dataToSave);
          savedRecord.id = docRef.id;
          setIsAdding(false);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'records');
        }
      }

      if (createSummary && onUseRecord) {
        onUseRecord(savedRecord as any as TPERecord);
      }

      setFormData({
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        recId: generateRecId(),
        firstName: '',
        lastName: '',
        middleInitial: '',
        patientId: '',
        sex: '',
        ht: undefined,
        wt: undefined,
        hct: undefined,
      });
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save record.");
    }
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, recId?: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'records', id));
      
      // Cascading delete for summaries
      if (recId) {
        try {
          const summariesQuery = query(
            collection(db, 'procedureSummaries'),
            where('userId', '==', auth.currentUser.uid),
            where('recId', '==', recId)
          );
          const summariesSnapshot = await getDocs(summariesQuery);
          const deletePromises = summariesSnapshot.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);
        } catch (err) {
          console.error("Error deleting linked summaries:", err);
        }
      }
      
      setIsDeleting(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `records/${id}`);
    }
  };

  const exportToCSV = () => {
    if (records.length === 0) return;

    const headers = [
      'Record ID', 'First Name', 'Last Name', 'MI', 'Patient ID', 'Date', 'Time',
      'Sex', 'Height (cm)', 'Weight (kg)', 'Hct (%)',
      'Start Time', 'End Time', 'Run Time (min)',
      'Inlet Processed (mL)', 'Plasma Removed (mL)', 'Replacement Used (mL)',
      'AC Used (mL)', 'Remove Bag (mL)', 'Bolus (mL)', 'Tubing Set (mL)', 'Rinseback (mL)',
      'Fluid Balance (mL)', 'Fluid Balance (%)', 'Plasma Volumes Exchanged',
      'AC in Remove Bag (mL)', 'AC to Patient (mL)', 'AC Used for Prime (mL)',
      'Saline to Patient Air (mL)', 'Custom Prime (mL)', 'Saline Rinse (mL)',
      'Entry Date', 'Entry Time'
    ];

    const csvRows = records.map(record => [
      record.recId || '',
      record.firstName || '',
      record.lastName || '',
      record.middleInitial || '',
      record.patientId || '',
      record.date || '',
      record.time || '',
      record.sex || '',
      record.ht || 0,
      record.wt || 0,
      record.hct || 0,
      record.startTime || '',
      record.endTime || '',
      record.runTime || 0,
      record.inletProcessed || 0,
      record.plasmaRemoved || 0,
      record.replacementUsed || 0,
      record.acUsed || 0,
      record.removeBag || 0,
      record.bolus || 0,
      record.tubingSet || 0,
      record.rinseback || 0,
      record.fluidBalanceMl || 0,
      record.fluidBalancePercent || 0,
      record.plasmaVolumesExchanged || 0,
      record.acInRemoveBag || 0,
      record.acToPatient || 0,
      record.acUsedForPrime || 0,
      record.salineToPatientAir || 0,
      record.customPrime || 0,
      record.salineRinse || 0,
      record.entryDate || '',
      record.entryTime || ''
    ].map(val => `"${val}"`).join(','));

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `TPE_Records_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startEdit = (record: TPERecord) => {
    setFormData(record);
    setEditingId(record.id || null);
    setIsAdding(true);
    setHasCapturedData(true);
  };

  const fetchPatientData = () => {
    if (patientData) {
      setFormData({
        ...formData,
        sex: patientData.sex === 'male' ? 'M' : 'F',
        ht: patientData.height,
        wt: patientData.weight,
        hct: patientData.hct
      });
    }
  };

  const renderField = (label: string, key: keyof TPERecord, type: 'number' | 'text' | 'date' | 'time' = 'number', readOnly: boolean = false) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <label className="text-[10px] font-black uppercase tracking-widest text-theme-text opacity-40">{label}</label>
        {key === 'hct' && (
          <button 
            onClick={fetchPatientData}
            className="text-[9px] font-bold text-theme-primary hover:underline flex items-center gap-1"
            title="Fetch from Patient Data"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Fetch
          </button>
        )}
      </div>
      <input
        type={type}
        value={(formData as any)[key] ?? ''}
        onChange={(e) => !readOnly && setFormData({ ...formData, [key]: e.target.value === '' ? undefined : (type === 'number' ? parseFloat(e.target.value) : e.target.value) })}
        readOnly={readOnly}
        className={cn(
          "w-full bg-theme-bg border border-theme-card-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary outline-none transition-all",
          readOnly && "opacity-60 cursor-not-allowed bg-theme-primary/5"
        )}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-theme-bg pb-20">
      {/* Header */}
      <header className="p-6 bg-theme-primary text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">TPE Records</h1>
              <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">History & Database</p>
            </div>
          </div>
          {!isAdding && (
            <button 
              onClick={() => {
                setIsAdding(true);
                setHasCapturedData(false);
              }}
              className="bg-white/20 hover:bg-white/30 p-2 rounded-xl backdrop-blur-sm transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="text-sm font-bold pr-1">New Record</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-6">
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
                    <Database className="w-5 h-5 text-theme-primary" />
                  </div>
                  <h2 className="font-bold text-theme-text">{editingId ? 'Edit Record' : 'Create New Record'}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <p className="hidden md:block text-[10px] font-bold text-theme-primary opacity-60 uppercase tracking-widest mr-2">
                    Capture/Upload Stats & Details screens
                  </p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                  />
                  <button 
                    onClick={() => setShowCamera(true)}
                    disabled={isUploading}
                    className="p-2 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-dark transition-colors flex items-center gap-2 shadow-lg shadow-theme-primary/20 disabled:opacity-50"
                    title="Capture Screen"
                  >
                    <CameraIcon className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="p-2 bg-theme-primary text-white rounded-xl hover:bg-theme-primary-dark transition-colors flex items-center gap-2 shadow-lg shadow-theme-primary/20 disabled:opacity-50"
                    title="Upload Image"
                  >
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={() => { 
                      setIsAdding(false); 
                      setEditingId(null); 
                      setHasCapturedData(false);
                      setFormData({
                        date: new Date().toISOString().split('T')[0],
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                        firstName: '',
                        lastName: '',
                        patientId: '',
                      }); 
                    }} 
                    className="p-2 hover:bg-theme-bg rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5 text-theme-text opacity-40" />
                  </button>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Patient Info */}
                <div className="lg:col-span-3 bg-theme-primary/5 p-4 rounded-2xl border border-theme-primary-border/30">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-theme-primary">Patient Info</h3>
                    <button 
                      onClick={() => setShowPatientsModal(true)}
                      className="p-1.5 bg-theme-primary/10 text-theme-primary rounded-lg hover:bg-theme-primary/20 transition-colors flex items-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Patients</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {renderField('Rec ID', 'recId', 'text', true)}
                    {renderField('Last Name', 'lastName', 'text')}
                    {renderField('First Name', 'firstName', 'text')}
                    {renderField('M.I.', 'middleInitial', 'text')}
                    {renderField('PID#', 'patientId', 'text')}
                  </div>
                </div>

                {/* Patient Stats Row */}
                <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 bg-theme-primary/5 p-4 rounded-2xl border border-theme-primary-border/30">
                  {renderField('Sex (M/F)', 'sex', 'text')}
                  {renderField('Ht (cm)', 'ht')}
                  {renderField('Wt (kg)', 'wt')}
                  {renderField('Hct (%)', 'hct')}
                </div>

                {/* Temporary Calculations Row */}
                <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 px-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-theme-primary opacity-60 px-1">Temp TBV (mL)</label>
                    <div className="w-full bg-theme-primary/5 border border-theme-primary-border/20 rounded-xl px-3 py-2 text-sm font-bold text-theme-primary">
                      {tempCalculations.tbv || '--'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-theme-primary opacity-60 px-1">Temp PV (mL)</label>
                    <div className="w-full bg-theme-primary/5 border border-theme-primary-border/20 rounded-xl px-3 py-2 text-sm font-bold text-theme-primary">
                      {tempCalculations.pv || '--'}
                    </div>
                  </div>
                </div>

                {/* Basic Info */}
                <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 bg-theme-bg/50 p-4 rounded-2xl border border-theme-card-border">
                  {renderField('Date', 'date', 'date')}
                  {renderField('Time', 'time', 'time')}
                  {renderField('Start Time', 'startTime', 'time')}
                  {renderField('End Time', 'endTime', 'time')}
                </div>

                {/* Page 1 Fields */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-theme-primary">Procedure Stats</h3>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-1.5 bg-theme-primary/10 text-theme-primary rounded-lg hover:bg-theme-primary/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      title="Upload Image using Report"
                    >
                      {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span className="text-[10px] font-bold uppercase tracking-wider">Upload</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                    {renderField('AC Used (mL)', 'acUsed')}
                    {renderField('Remove Bag (mL)', 'removeBag')}
                    {renderField('Replacement Used (mL)', 'replacementUsed')}
                    {renderField('Bolus (mL)', 'bolus')}
                    {renderField('Tubing Set (mL)', 'tubingSet')}
                    {renderField('Rinseback (mL)', 'rinseback')}
                    {renderField('Run Time (min)', 'runTime')}
                    {renderField('Fluid Balance (mL)', 'fluidBalanceMl')}
                    {renderField('Fluid Balance (%)', 'fluidBalancePercent')}
                    {renderField('Inlet Processed (mL)', 'inletProcessed')}
                  </div>
                </div>

                {/* Page 2 Fields */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-theme-primary">Exchange Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                    {renderField('Plasma Vol Exchanged', 'plasmaVolumesExchanged')}
                    {renderField('Plasma Removed (mL)', 'plasmaRemoved')}
                    {renderField('AC in Remove Bag (mL)', 'acInRemoveBag')}
                    {renderField('AC to Patient (mL)', 'acToPatient')}
                    {renderField('AC Used for Prime (mL)', 'acUsedForPrime')}
                    {renderField('Saline to Patient (Air)', 'salineToPatientAir')}
                    {renderField('Custom Prime (mL)', 'customPrime')}
                    {renderField('Saline Rinse (mL)', 'salineRinse')}
                  </div>
                </div>

                {/* Summary / Preview */}
                <div className="bg-theme-primary-bg/50 p-6 rounded-3xl border border-theme-primary-border flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-theme-primary mb-4">Summary</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-theme-text opacity-60">Total Processed</span>
                        <span className="font-bold text-theme-primary">{formData.inletProcessed || 0} mL</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-theme-text opacity-60">Plasma Removed</span>
                        <span className="font-bold text-theme-primary">{formData.plasmaRemoved || 0} mL</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-theme-text opacity-60">Replacement Used</span>
                        <span className="font-bold text-theme-primary">{formData.replacementUsed || 0} mL</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {editingId ? (
                      <>
                        <button 
                          onClick={() => handleSave(false)}
                          disabled={!hasCapturedData}
                          className={cn(
                            "w-full mt-8 py-4 bg-theme-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-theme-primary/20 hover:scale-[1.02] active:scale-95 transition-all",
                            !hasCapturedData && "opacity-40 grayscale cursor-not-allowed"
                          )}
                        >
                          <Save className="w-5 h-5" />
                          Update Record
                        </button>
                        <button 
                          disabled={true}
                          className="w-full py-4 bg-theme-primary/5 text-theme-text opacity-30 grayscale cursor-not-allowed border border-theme-card-border rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
                        >
                          <ArrowRight className="w-5 h-5" />
                          Save & Create Summary
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => handleSave(true)}
                        disabled={!hasCapturedData}
                        className={cn(
                          "w-full mt-8 py-4 bg-theme-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-theme-primary/20 hover:scale-[1.02] active:scale-95 transition-all",
                          !hasCapturedData && "opacity-40 grayscale cursor-not-allowed"
                        )}
                      >
                        <ArrowRight className="w-5 h-5" />
                        Save & Create Summary
                      </button>
                    )}
                  </div>
                </div>
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
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-theme-text opacity-40">
                  <Database className="w-12 h-12 animate-pulse mb-4" />
                  <p className="font-bold uppercase tracking-widest text-xs">Loading Records...</p>
                </div>
              ) : records.length === 0 ? (
                <div className="bg-theme-card rounded-3xl p-12 text-center border border-theme-card-border shadow-xl">
                  <div className="w-20 h-20 bg-theme-primary-bg rounded-full flex items-center justify-center mx-auto mb-6">
                    <Database className="w-10 h-10 text-theme-primary opacity-40" />
                  </div>
                  <h3 className="text-xl font-bold text-theme-text mb-2">No Records Found</h3>
                  <p className="text-theme-text opacity-60 max-w-xs mx-auto mb-8">
                    Start by capturing a screen or manually adding your first TPE procedure record.
                  </p>
                  <button 
                    onClick={() => {
                      setIsAdding(true);
                      setHasCapturedData(false);
                    }}
                    className="bg-theme-primary text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-theme-primary/20 hover:scale-105 transition-all inline-flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Add First Record
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Search & Sort Bar */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative group flex-1">
                      <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                        <Search className="w-5 h-5 text-theme-text opacity-20 group-focus-within:text-theme-primary group-focus-within:opacity-100 transition-all" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search by name, ID #, or date (YYYY-MM-DD)..."
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

                  {filteredRecords.length === 0 ? (
                    <div className="bg-theme-card rounded-3xl p-12 text-center border border-theme-card-border shadow-xl">
                      <div className="w-20 h-20 bg-theme-primary-bg rounded-full flex items-center justify-center mx-auto mb-6">
                        <Search className="w-10 h-10 text-theme-primary opacity-40" />
                      </div>
                      <h3 className="text-xl font-bold text-theme-text mb-2">No matching records</h3>
                      <p className="text-theme-text opacity-60 max-w-xs mx-auto">
                        Try searching for a different name, ID, or date format.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {filteredRecords.map((record) => (
                    <motion.div
                      layout
                      key={record.id}
                      className="bg-theme-card rounded-3xl p-3.5 border border-theme-card-border shadow-md hover:shadow-xl transition-all group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="bg-theme-primary-bg p-2 rounded-2xl">
                            <User className="w-5 h-5 text-theme-primary" />
                          </div>
                          <div>
                            <h4 className="font-black text-theme-text text-sm">
                              {record.recId && <span className="text-theme-primary mr-1">[{record.recId}]</span>}
                              {record.lastName}, {record.firstName} {record.middleInitial ? `${record.middleInitial}.` : ''}
                              {record.patientId && <span className="ml-1 text-[9px] opacity-40">PID#{record.patientId}</span>}
                            </h4>
                            <div className="flex items-center gap-2 text-[9px] font-bold text-theme-text opacity-40 uppercase tracking-widest">
                              <Calendar className="w-3 h-3" />
                              {record.date} • {record.time || 'No Time'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 transition-opacity">
                          {isDeleting === record.id ? (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleDelete(record.id!, record.recId)}
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
                                onClick={() => startEdit(record)}
                                className="p-1.5 hover:bg-theme-bg rounded-xl text-theme-primary transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setIsDeleting(record.id!)}
                                className="p-1.5 hover:bg-red-50 rounded-xl text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 border-t border-theme-card-border pt-2.5">
                        <div className="text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-theme-text opacity-40 mb-0.5">Inlet</p>
                          <p className="font-bold text-theme-text text-sm">{record.inletProcessed || 0} <span className="text-[9px] opacity-40">mL</span></p>
                        </div>
                        <div className="text-center border-x border-theme-card-border">
                          <p className="text-[8px] font-black uppercase tracking-widest text-theme-text opacity-40 mb-0.5">Plasma</p>
                          <p className="font-bold text-theme-text text-sm">{record.plasmaRemoved || 0} <span className="text-[9px] opacity-40">mL</span></p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-theme-text opacity-40 mb-0.5">Replacement</p>
                          <p className="font-bold text-theme-text text-sm">{record.replacementUsed || 0} <span className="text-[9px] opacity-40">mL</span></p>
                        </div>
                      </div>
                      
                      {onUseRecord && (
                        <button 
                          onClick={() => onUseRecord(record)}
                          className="w-full mt-2.5 py-2.5 bg-theme-primary-bg text-theme-primary rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-theme-primary hover:text-white transition-all"
                        >
                          Use in Summary
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {showCamera && (
        <CameraOCR 
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {reviewData && (
        <ReviewOCR 
          data={reviewData}
          onConfirm={(data) => {
            handleCapture(data);
            setReviewData(null);
          }}
          onCancel={() => setReviewData(null)}
          title="Review Uploaded Data"
        />
      )}

      <AnimatePresence>
        {showPatientsModal && (
          <PatientsModal 
            onClose={() => setShowPatientsModal(false)}
            onSelectPatient={(patient) => {
              setFormData({
                ...formData,
                firstName: patient.firstName,
                lastName: patient.lastName,
                middleInitial: patient.middleInitial,
                patientId: patient.patientId
              });
            }}
          />
        )}
      </AnimatePresence>

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
