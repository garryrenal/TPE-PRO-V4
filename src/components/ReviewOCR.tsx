import React, { useState } from 'react';
import { Check, X, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface ReviewOCRProps {
  data: any;
  onConfirm: (data: any) => void;
  onCancel: () => void;
  title?: string;
}

export default function ReviewOCR({ data, onConfirm, onCancel, title = "Review Extracted Data" }: ReviewOCRProps) {
  const [editedData, setEditedData] = useState(() => {
    const initial = { ...data };
    const numericFields = [
      'acUsed', 'removeBag', 'replacementUsed', 'bolus', 'tubingSet', 'rinseback', 
      'runTime', 'fluidBalanceMl', 'fluidBalancePercent', 'inletProcessed', 
      'plasmaVolumesExchanged', 'plasmaRemoved', 'acInRemoveBag', 'acToPatient', 
      'acUsedForPrime', 'salineToPatientAir', 'customPrime', 'salineRinse'
    ];

    // Clean up all fields: convert null, undefined, or "null" string to appropriate empty values
    Object.keys(initial).forEach(key => {
      const val = initial[key];
      if (val === null || val === undefined || (typeof val === 'string' && val.toLowerCase() === 'null')) {
        if (numericFields.includes(key)) {
          initial[key] = 0;
        } else {
          initial[key] = '';
        }
      }
    });
    return initial;
  });

  const handleChange = (key: string, value: any) => {
    setEditedData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    onConfirm(editedData);
  };

  const formatKey = (key: string) => {
    return key.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, (c) => c.toUpperCase());
  };

  const keysToAlwaysShow = ['firstName', 'lastName', 'middleInitial', 'patientId'];

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-theme-card rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-theme-card-border"
      >
        <div className="p-6 border-b border-theme-card-border flex items-center justify-between bg-theme-primary text-white">
          <div className="flex items-center gap-3">
            <Check className="w-6 h-6" />
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-theme-bg">
          <div className="flex items-start gap-3 p-4 bg-theme-primary/10 border border-theme-primary/20 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-theme-primary shrink-0 mt-0.5" />
            <p className="text-theme-primary/80 text-xs leading-relaxed font-medium">
              Gemini has extracted the following data from your images. Please verify and correct any errors before proceeding.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(editedData).map(([key, value]) => {
              if ((value === null || value === undefined) && !keysToAlwaysShow.includes(key)) return null;
              return (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-theme-primary opacity-60 px-1">
                    {formatKey(key)}
                  </label>
                  <input
                    type={
                      key === 'date' ? 'date' :
                      (key === 'time' || key === 'startTime' || key === 'endTime') ? 'time' :
                      typeof value === 'number' ? 'number' : 'text'
                    }
                    value={(value ?? '') as any}
                    onChange={(e) => handleChange(key, typeof value === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                    className="w-full bg-theme-card border border-theme-card-border rounded-xl px-3 py-2 text-sm text-theme-text focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary outline-none transition-all"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 border-t border-theme-card-border bg-theme-card flex gap-4">
          <button 
            onClick={onCancel}
            className="flex-1 py-4 bg-theme-bg text-theme-text rounded-2xl font-bold hover:bg-theme-card-border transition-colors border border-theme-card-border"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            className="flex-1 py-4 bg-theme-primary text-white rounded-2xl font-bold shadow-xl shadow-theme-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
          >
            Confirm & Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}
