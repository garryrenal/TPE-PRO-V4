import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, User, Loader2 } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { cn } from '../lib/utils';

export interface Patient {
  id?: string;
  userId: string;
  firstName: string;
  lastName: string;
  middleInitial: string;
  patientId: string;
  createdAt: string;
}

interface PatientsModalProps {
  onClose: () => void;
  onSelectPatient: (patient: Patient) => void;
}

export default function PatientsModal({ onClose, onSelectPatient }: PatientsModalProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    middleInitial: '',
    patientId: ''
  });

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'patients'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const patientData: Patient[] = [];
      snapshot.forEach((doc) => {
        patientData.push({ id: doc.id, ...doc.data() } as Patient);
      });
      // Sort by last name
      patientData.sort((a, b) => a.lastName.localeCompare(b.lastName));
      setPatients(patientData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'patients');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser) return;
    if (!formData.lastName || !formData.firstName) return;

    try {
      const newRef = doc(collection(db, 'patients'));
      await setDoc(newRef, {
        ...formData,
        userId: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
      setIsAdding(false);
      setFormData({ firstName: '', lastName: '', middleInitial: '', patientId: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'patients');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'patients', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${id}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-2xl bg-theme-card rounded-3xl shadow-2xl border border-theme-card-border overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-theme-card-border flex items-center justify-between bg-theme-primary-bg/30">
          <div className="flex items-center gap-3">
            <div className="bg-theme-primary/10 p-2 rounded-xl">
              <User className="w-5 h-5 text-theme-primary" />
            </div>
            <h2 className="font-bold text-theme-text">Patients</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-theme-bg rounded-xl transition-colors">
            <X className="w-5 h-5 text-theme-text opacity-40" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {isAdding ? (
            <div className="bg-theme-primary/5 p-4 rounded-2xl border border-theme-primary-border/30 space-y-4 mb-6">
              <h3 className="text-sm font-bold text-theme-primary">New Patient</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-theme-text opacity-40">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={e => setFormData({...formData, lastName: e.target.value})}
                    className="w-full mt-1 bg-theme-bg border border-theme-card-border rounded-xl px-3 py-2 text-sm font-medium text-theme-text focus:outline-none focus:border-theme-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-theme-text opacity-40">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={e => setFormData({...formData, firstName: e.target.value})}
                    className="w-full mt-1 bg-theme-bg border border-theme-card-border rounded-xl px-3 py-2 text-sm font-medium text-theme-text focus:outline-none focus:border-theme-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-theme-text opacity-40">Middle Initial</label>
                  <input
                    type="text"
                    value={formData.middleInitial}
                    onChange={e => setFormData({...formData, middleInitial: e.target.value})}
                    className="w-full mt-1 bg-theme-bg border border-theme-card-border rounded-xl px-3 py-2 text-sm font-medium text-theme-text focus:outline-none focus:border-theme-primary transition-colors"
                    maxLength={1}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-theme-text opacity-40">PID#</label>
                  <input
                    type="text"
                    value={formData.patientId}
                    onChange={e => setFormData({...formData, patientId: e.target.value})}
                    className="w-full mt-1 bg-theme-bg border border-theme-card-border rounded-xl px-3 py-2 text-sm font-medium text-theme-text focus:outline-none focus:border-theme-primary transition-colors"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-theme-text opacity-60 hover:opacity-100 hover:bg-theme-bg transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={!formData.lastName || !formData.firstName}
                  className="px-4 py-2 bg-theme-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-theme-primary/20 disabled:opacity-50 transition-all"
                >
                  Save Patient
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsAdding(true)}
              className="w-full mb-6 py-3 border-2 border-dashed border-theme-primary/30 rounded-2xl text-theme-primary font-bold text-sm flex items-center justify-center gap-2 hover:bg-theme-primary/5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New Patient
            </button>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
            </div>
          ) : patients.length === 0 && !isAdding ? (
            <div className="text-center py-8 opacity-50">
              <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No patients found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {patients.map(patient => (
                <div key={patient.id} className="flex items-center justify-between p-4 rounded-2xl border border-theme-card-border bg-theme-bg hover:border-theme-primary/30 transition-colors group">
                  <div>
                    <h4 className="font-bold text-theme-text">
                      {patient.lastName}, {patient.firstName} {patient.middleInitial}
                    </h4>
                    <p className="text-xs font-medium text-theme-text opacity-50 mt-0.5">
                      PID: {patient.patientId || 'N/A'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        onSelectPatient(patient);
                      }}
                      className="px-4 py-2 bg-theme-primary/10 text-theme-primary rounded-xl text-xs font-bold hover:bg-theme-primary hover:text-white transition-all"
                    >
                      Select
                    </button>
                    <button 
                      onClick={() => patient.id && handleDelete(patient.id)}
                      className="p-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-xl transition-all"
                      title="Delete Patient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
