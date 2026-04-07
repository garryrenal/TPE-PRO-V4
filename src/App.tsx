import React, { useState, useMemo, useEffect, ErrorInfo, ReactNode } from 'react';
import { 
  Activity, 
  User, 
  Info, 
  Palette,
  RotateCcw,
  AlertCircle,
  X,
  Database,
  LogIn,
  LogOut,
  Loader2,
  FileText,
  ArrowRight,
  Calculator
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { cn } from './lib/utils';
import { 
  calculateTBV,
  calculateBSA,
  PatientData, 
  Sex
} from './lib/calculations';
import Records from './components/Records';
import { Chatbot } from './components/Chatbot';
import ProcedureSummaries from './components/ProcedureSummaries';

export default function App() {
  return (
    <AppContent />
  );
}

function AppContent() {
  const [view, setView] = useState<'calculator' | 'records' | 'summaries'>('calculator');
  const [calcMode, setCalcMode] = useState<'tpe' | 'rbcx' | 'depletion'>('tpe');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLogic, setShowLogic] = useState(false);
  const [theme, setTheme] = useState<'emerald' | 'blue' | 'violet' | 'amber' | 'futuristic'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tpe-theme');
      if (saved && ['emerald', 'blue', 'violet', 'amber', 'futuristic'].includes(saved)) {
        return saved as any;
      }
    }
    return 'emerald';
  });

  useEffect(() => {
    localStorage.setItem('tpe-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.className = theme;
  }, [theme]);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [prefilledSummary, setPrefilledSummary] = useState<any>(null);
  
  // Patient Data
  const [sex, setSex] = useState<Sex>('male');
  const [height, setHeight] = useState<string>('175');
  const [heightFt, setHeightFt] = useState<string>('5');
  const [heightIn, setHeightIn] = useState<string>('9');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft/in'>('cm');
  const [weight, setWeight] = useState<string>('70');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [hct, setHct] = useState<string>('30');
  const [hgb, setHgb] = useState<string>('10');
  const [inputMode, setInputMode] = useState<'hct' | 'hgb'>('hct');

  // RBCX Params
  const [targetHct, setTargetHct] = useState<string>('30');
  const [targetFCR, setTargetFCR] = useState<string>('30');
  const [replacementHct, setReplacementHct] = useState<string>('65');
  const [initialHgbS, setInitialHgbS] = useState<string>('80');
  const [goalHgbS, setGoalHgbS] = useState<string>('30');
  const [minHct, setMinHct] = useState<string>('30');
  const [showRbcxCalc, setShowRbcxCalc] = useState(false);
  const [activeScenario, setActiveScenario] = useState<keyof typeof SCENARIOS | null>(null);

    const SCENARIOS = {
    standard: {
      name: 'Standard RBCX (Anemia/SCD)',
      targetHct: '30',
      minHct: '30',
      targetFCR: '30',
      replacementHct: '65',
      description: 'Standard exchange for Sickle Cell Disease management.'
    },
    hemorrhage: {
      name: 'RBCX for Hemorrhage/Acute',
      targetHct: '30',
      minHct: '30',
      targetFCR: '20',
      replacementHct: '70',
      description: 'Aggressive exchange for acute complications or severe hemorrhage.'
    },
    postSurgery: {
      name: 'RBCX for Post-Surgery',
      targetHct: '32',
      minHct: '32',
      targetFCR: '30',
      replacementHct: '65',
      description: 'Maintenance exchange post-surgery to prevent complications.'
    }
  };

  const applyScenario = (scenario: keyof typeof SCENARIOS) => {
    const s = SCENARIOS[scenario];
    setTargetHct(s.targetHct);
    setMinHct(s.minHct);
    setTargetFCR(s.targetFCR);
    setReplacementHct(s.replacementHct);
    setActiveScenario(scenario);
    
    // Update Goal HbS based on scenario FCR and current Initial HbS
    const iS = parseFloat(initialHgbS) || 80;
    const fcr = parseFloat(s.targetFCR);
    if (iS > 0 && fcr > 0) {
      setGoalHgbS(((fcr / 100) * iS).toFixed(1));
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Test Firestore Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    }
    testConnection();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Create user document if it doesn't exist
      const userDocRef = doc(db, 'users', user.uid);
      try {
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            userId: user.uid,
            email: user.email,
            role: 'user',
            createdAt: new Date().toISOString()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('calculator');
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // Validation Limits
  const LIMITS = {
    height: { min: 100, max: 250, unit: 'cm' },
    heightIn: { min: 39, max: 98, unit: 'in' },
    weight: { min: 10, max: 250, unit: 'kg' },
    weightLb: { min: 22, max: 551, unit: 'lb' },
    hct: { min: 10, max: 60 }
  };

  const handleWeightUnitChange = () => {
    const newUnit = weightUnit === 'kg' ? 'lb' : 'kg';
    const currentWeight = parseFloat(weight);
    if (!isNaN(currentWeight)) {
      if (newUnit === 'lb') {
        setWeight(Math.round(currentWeight * 2.20462).toString());
      } else {
        setWeight(Math.round(currentWeight / 2.20462).toString());
      }
    }
    setWeightUnit(newUnit);
  };

  const handleHeightUnitChange = () => {
    const newUnit = heightUnit === 'cm' ? 'ft/in' : 'cm';
    if (newUnit === 'ft/in') {
      const totalInches = parseFloat(height) / 2.54;
      if (!isNaN(totalInches)) {
        const ft = Math.floor(totalInches / 12);
        const inch = Math.round(totalInches % 12);
        setHeightFt(ft.toString());
        setHeightIn(inch.toString());
      }
    } else {
      const ft = parseFloat(heightFt) || 0;
      const inch = parseFloat(heightIn) || 0;
      const totalInches = (ft * 12) + inch;
      setHeight(Math.round(totalInches * 2.54).toString());
    }
    setHeightUnit(newUnit);
  };

  const patientData: PatientData = useMemo(() => {
    let finalHeight = 0;
    if (heightUnit === 'cm') {
      finalHeight = parseFloat(height) || 0;
    } else {
      const ft = parseFloat(heightFt) || 0;
      const inch = parseFloat(heightIn) || 0;
      finalHeight = (ft * 12 + inch) * 2.54;
    }

    return {
      sex,
      height: finalHeight,
      heightUnit: 'cm',
      weight: parseFloat(weight) || 0,
      weightUnit,
      hct: parseFloat(hct) || 0,
    };
  }, [sex, height, heightFt, heightIn, heightUnit, weight, weightUnit, hct]);

  const isPatientValid = useMemo(() => {
    const w = parseFloat(weight);
    const hc = parseFloat(hct);
    
    if (heightUnit === 'cm') {
      const h = parseFloat(height);
      if (isNaN(h) || h < LIMITS.height.min || h > LIMITS.height.max) return false;
    } else {
      const ft = parseFloat(heightFt);
      const inch = parseFloat(heightIn);
      if (isNaN(ft) && isNaN(inch)) return false;
      const totalInches = (parseFloat(heightFt) || 0) * 12 + (parseFloat(heightIn) || 0);
      if (totalInches < LIMITS.heightIn.min || totalInches > LIMITS.heightIn.max) return false;
    }
    
    if (weightUnit === 'kg') {
      if (isNaN(w) || w < LIMITS.weight.min || w > LIMITS.weight.max) return false;
    } else {
      if (isNaN(w) || w < LIMITS.weightLb.min || w > LIMITS.weightLb.max) return false;
    }
    
    if (isNaN(hc) || hc < LIMITS.hct.min || hc > LIMITS.hct.max) return false;
    
    return true;
  }, [height, weight, hct, heightUnit, weightUnit, heightFt, heightIn]);

  const stats = useMemo(() => {
    if (!isPatientValid) return null;
    
    const tbv = calculateTBV(patientData);
    const hCm = patientData.height;
    const wKg = weightUnit === 'kg' ? patientData.weight : patientData.weight * 0.453592;
    const bsa = calculateBSA(hCm, wKg);
    const rcv = tbv * (patientData.hct / 100);
    const pv = tbv - rcv;

    // RBCX Calculations
    const tHct = parseFloat(targetHct) || 0;
    const mHct = parseFloat(minHct) || 0;
    const tFCR = parseFloat(targetFCR) || 0;
    const rHct = parseFloat(replacementHct) || 0;
    const iHgbS = parseFloat(initialHgbS) || 0;
    const gHgbS = parseFloat(goalHgbS) || 0;
    
    // Depletion Phase Volume = TBV * ln(Starting Hct / Min Hct)
    let depletionVolume = 0;
    if (patientData.hct > 0 && mHct > 0 && patientData.hct > mHct) {
      depletionVolume = tbv * Math.log(patientData.hct / mHct);
    }

    // Exchange Phase Volume = TBV * -ln(Target FCR / 100)
    let rbcxVolume = 0;
    if (tFCR > 0) {
      rbcxVolume = tbv * -Math.log(tFCR / 100);
    }
    
    // RBC units assume 350 mL per unit and are rounded up to the nearest whole unit
    const rbcxUnits = Math.ceil(rbcxVolume / 350);

    return { tbv, bsa, rcv, pv, rbcxVolume, rbcxUnits, depletionVolume };
  }, [patientData, isPatientValid, weightUnit, targetHct, minHct, targetFCR, replacementHct, initialHgbS, goalHgbS]);

  const resetPatientData = () => {
    setHeight('');
    setHeightFt('');
    setHeightIn('');
    setWeight('');
    setHct('');
    setHgb('');
    setMinHct('30');
    setActiveScenario(null);
  };

  const handleUseRecord = (record: any) => {
    const summaryData = {
      recId: record.recId || '',
      firstName: record.firstName || '',
      lastName: record.lastName || '',
      patientId: record.patientId || '',
      date: record.date || '',
      startTime: record.startTime || '',
      endTime: record.endTime || '',
      replacedVol: record.replacementUsed || 0,
      acToPt: record.acToPatient || 0,
      rinseback: record.rinseback || 0,
      removedVol: record.removeBag || 0,
      acCollBag: record.acInRemoveBag || 0,
      fluidBalancePercent: record.fluidBalancePercent || 0,
      finalPlasmaExch: record.plasmaVolumesExchanged || 0,
      bloodVolProcessed: record.inletProcessed || 0,
    };
    setPrefilledSummary(summaryData);
    setView('summaries');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-12 h-12 text-theme-primary animate-spin" />
      </div>
    );
  }

  if (view === 'records' && user) {
    return (
      <div className={cn("min-h-screen", theme)} data-theme={theme}>
        <Records 
          onBack={() => setView('calculator')} 
          onUseRecord={handleUseRecord} 
          patientData={patientData}
        />
      </div>
    );
  }

  if (view === 'summaries' && user) {
    return (
      <div className={cn("min-h-screen", theme)} data-theme={theme}>
        <ProcedureSummaries 
          onBack={() => setView('calculator')} 
          prefilledData={prefilledSummary}
          onClearPrefilled={() => setPrefilledSummary(null)}
        />
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen font-sans pb-12 transition-colors duration-500 bg-theme-bg text-theme-text",
      theme
    )} data-theme={theme}>
      {/* Header */}
      <header className={cn(
        "p-4 sm:p-6 shadow-lg sticky top-0 z-10 transition-all duration-500 bg-theme-primary text-white"
      )}>
        <div className="max-w-md mx-auto flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="bg-white/20 p-1.5 sm:p-2 rounded-xl backdrop-blur-sm shrink-0">
                  {calcMode === 'tpe' ? <Activity className="w-5 h-5 sm:w-6 sm:h-6" /> : <Calculator className="w-5 h-5 sm:w-6 sm:h-6" />}
                </div>
                <div>
                  <h1 className="text-base sm:text-xl font-bold tracking-tight leading-none">APHERESIS PRO</h1>
                </div>
              </div>
          <div className="flex flex-wrap items-center gap-1 relative">
            {user && (
              <>
                <button 
                  onClick={() => setView('records')}
                  className={cn(
                    "p-1.5 sm:p-2 rounded-full transition-colors",
                    view === 'records' ? "bg-white/20" : "hover:bg-white/10"
                  )}
                  title="View Records"
                >
                  <Database className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button 
                  onClick={() => setView('summaries')}
                  className={cn(
                    "p-1.5 sm:p-2 rounded-full transition-colors",
                    view === 'summaries' ? "bg-white/20" : "hover:bg-white/10"
                  )}
                  title="Procedure Summaries"
                >
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </>
            )}
            {!user && (
              <button 
                onClick={handleLogin}
                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Sign In with Google"
              >
                <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
            <div className="relative">
              <button 
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Change Theme"
              >
                <Palette className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              
              <AnimatePresence>
                {showThemeMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setShowThemeMenu(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className={cn(
                        "absolute right-0 mt-2 w-48 rounded-2xl shadow-2xl border p-2 z-30 overflow-hidden transition-colors duration-500",
                        "bg-theme-card border-theme-card-border"
                      )}
                    >
                      <div className="px-3 py-2 border-b border-theme-card-border mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-theme-text opacity-40">Select Theme</span>
                      </div>
                      {[
                        { id: 'emerald', label: 'Emerald', color: 'bg-emerald-500' },
                        { id: 'blue', label: 'Ocean Blue', color: 'bg-blue-500' },
                        { id: 'violet', label: 'Royal Violet', color: 'bg-violet-500' },
                        { id: 'amber', label: 'Warm Amber', color: 'bg-amber-500' },
                        { id: 'futuristic', label: 'Futuristic', color: 'bg-cyan-500' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTheme(t.id as any);
                            setShowThemeMenu(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-bold",
                            theme === t.id 
                              ? "bg-theme-primary/10 text-theme-primary" 
                              : "text-theme-text opacity-60 hover:bg-theme-primary/5 hover:opacity-100"
                          )}
                        >
                          <div className={cn("w-4 h-4 rounded-full shadow-inner", t.color)} />
                          {t.label}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={() => setShowLogic(true)}
              className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors"
              title="View Calculation Logic"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
              onClick={resetPatientData}
              className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors"
              title="Reset All"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            {user && (
              <button 
                onClick={handleLogout}
                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Logic Modal */}
      <AnimatePresence>
        {showLogic && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowLogic(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={cn(
                "w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-colors duration-500 bg-theme-card border-theme-card-border"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn(
                "px-8 pt-8 pb-4 border-b flex justify-between items-center z-10 bg-theme-card border-theme-card-border"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-xl bg-theme-primary/10 text-theme-primary"
                  )}>
                    <Info className="w-5 h-5" />
                  </div>
                  <h2 className={cn(
                    "text-xl font-black tracking-tight text-slate-900"
                  )}>Calculation Logic</h2>
                </div>
                <button 
                  onClick={() => setShowLogic(false)} 
                  className={cn(
                    "p-2 rounded-full transition-colors group hover:bg-slate-100"
                  )}
                >
                  <X className={cn(
                    "w-5 h-5 text-slate-400 group-hover:text-slate-600"
                  )} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 custom-scrollbar">
                <section className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-500">1</div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Total Blood Volume (TBV)</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4 font-medium pl-9">
                    Uses standard formula based on sex, height (m), and weight (kg):
                  </p>
                  <div className="ml-9 bg-slate-50 p-5 rounded-2xl font-mono text-[11px] text-slate-700 space-y-3 border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-theme-primary font-bold">Male:</span>
                      <span className="tracking-tight">0.3669h³ + 0.03219w + 0.6041</span>
                    </div>
                    <div className="h-px bg-slate-200/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-theme-primary font-bold">Female:</span>
                      <span className="tracking-tight">0.3561h³ + 0.03308w + 0.1833</span>
                    </div>
                  </div>
                </section>

                <section className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-500">2</div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Body Surface Area (BSA)</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4 font-medium pl-9">
                    Calculated using the Mosteller formula:
                  </p>
                  <div className="ml-9 bg-slate-50 p-5 rounded-2xl font-mono text-[11px] text-slate-700 border border-slate-100 text-center">
                    BSA = √((Height × Weight) / 3600)
                  </div>
                </section>

                <section className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-500">3</div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Red Cell Volume (RCV)</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4 font-medium pl-9">
                    Estimated based on TBV and Hematocrit:
                  </p>
                  <div className="ml-9 bg-slate-50 p-5 rounded-2xl font-mono text-[11px] text-slate-700 border border-slate-100 text-center">
                    RCV = TBV × (Hct / 100)
                  </div>
                </section>

                <section className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-500">4</div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Plasma Volume (PV)</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4 font-medium pl-9">
                    The remaining volume after subtracting RCV:
                  </p>
                  <div className="ml-9 bg-slate-50 p-5 rounded-2xl font-mono text-[11px] text-slate-700 border border-slate-100 text-center">
                    PV = TBV - RCV
                  </div>
                </section>

                <section className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-500">5</div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Depletion/Exchange Phase</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4 font-medium pl-9">
                    A two-phase procedure to optimize donor unit usage:
                  </p>
                  <div className="ml-9 space-y-4">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-black text-theme-primary uppercase mb-2 tracking-widest">Phase 1: Depletion</div>
                      <div className="font-mono text-[11px] text-slate-700 text-center">
                        Vol = TBV × ln(Start Hct / Min Hct)
                      </div>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-black text-theme-primary uppercase mb-2 tracking-widest">Phase 2: Exchange</div>
                      <div className="font-mono text-[11px] text-slate-700 text-center">
                        Vol = RCV_min × ln(Start HbS / Goal HbS) / Donor_Hct
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 pl-9 italic">
                    * RCV_min: Red Cell Volume at the target Min Hct.
                  </p>
                </section>
              </div>

              <div className={cn(
                "p-8 border-t z-10 bg-theme-card border-theme-card-border"
              )}>
                <button 
                  onClick={() => setShowLogic(false)}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-[0.98] transition-all hover:brightness-110 bg-theme-primary text-white shadow-theme-primary-shadow"
                  )}
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Mode Toggle */}
        <div className="flex p-1 bg-theme-card border border-theme-card-border rounded-2xl shadow-sm">
          <button
            onClick={() => {
              setCalcMode('tpe');
              setActiveScenario(null);
            }}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              calcMode === 'tpe' 
                ? "bg-theme-primary text-white shadow-lg shadow-theme-primary/20" 
                : "text-theme-text opacity-40 hover:opacity-100"
            )}
          >
            TPE Mode
          </button>
          <button
            onClick={() => setCalcMode('rbcx')}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
              calcMode === 'rbcx' 
                ? "bg-theme-primary text-white shadow-lg shadow-theme-primary/20" 
                : "text-theme-text opacity-40 hover:opacity-100"
            )}
          >
            <Calculator className="w-3.5 h-3.5" />
            RBCX (Depletion/Exchange)
          </button>
          <button
            onClick={() => {
              setCalcMode('depletion');
              setActiveScenario(null);
            }}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
              calcMode === 'depletion' 
                ? "bg-theme-primary text-white shadow-lg shadow-theme-primary/20" 
                : "text-theme-text opacity-40 hover:opacity-100"
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            Simple Depletion
          </button>
        </div>

        {calcMode === 'rbcx' && (
          <motion.section 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl shadow-sm border bg-theme-card border-theme-card-border space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-theme-primary">
                <Activity className="w-5 h-5" />
                <h2 className="font-semibold">
                  {activeScenario ? 'Selected Scenario' : 'RBCX Scenarios'}
                </h2>
              </div>
              {activeScenario && (
                <button 
                  onClick={() => setActiveScenario(null)}
                  className="text-[10px] font-black uppercase tracking-widest text-theme-primary hover:opacity-70 transition-opacity"
                >
                  Change
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {activeScenario ? (
                <div className="p-4 rounded-2xl border border-theme-primary bg-theme-primary/5 transition-all text-left">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold text-theme-primary">{SCENARIOS[activeScenario].name}</span>
                  </div>
                  <p className="text-[10px] text-theme-text opacity-60 font-medium leading-relaxed">
                    {SCENARIOS[activeScenario].description}
                  </p>
                </div>
              ) : (
                Object.entries(SCENARIOS).map(([key, s]) => (
                  <button
                    key={key}
                    onClick={() => applyScenario(key as any)}
                    className="p-4 rounded-2xl border border-theme-card-border bg-theme-bg hover:border-theme-primary transition-all text-left group"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold text-theme-text group-hover:text-theme-primary transition-colors">{s.name}</span>
                      <ArrowRight className="w-4 h-4 text-theme-primary opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <p className="text-[10px] text-theme-text opacity-40 font-medium leading-relaxed">{s.description}</p>
                  </button>
                ))
              )}
            </div>
          </motion.section>
        )}

        {calcMode === 'depletion' && (
          <motion.section 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl shadow-sm border bg-theme-card border-theme-card-border space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-theme-primary">
                <Activity className="w-5 h-5" />
                <h2 className="font-semibold">RBC Depletion</h2>
              </div>
              <div className="text-[10px] font-bold text-theme-primary opacity-60 italic">
                Vol = TBV × ln(Start Hct / Target Hct)
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <InputGroup
                label="Target Hematocrit"
                value={minHct}
                onChange={setMinHct}
                placeholder="e.g. 30"
                unit="%"
                min={20}
                max={50}
                theme={theme}
                helper="Desired Hct after depletion"
              />
            </div>
          </motion.section>
        )}

        <AnimatePresence>
          {(calcMode === 'tpe' || activeScenario || calcMode === 'depletion') && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "p-6 rounded-3xl shadow-sm border transition-all duration-500 bg-theme-card border-theme-card-border"
              )}
            >
          <div className="flex items-center justify-between mb-6">
            <div className={cn(
              "flex items-center gap-2 text-theme-primary"
            )}>
              <User className="w-5 h-5" />
              <h2 className="font-semibold">Patient Data</h2>
            </div>
            <button
              onClick={resetPatientData}
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
              title="Reset All Data"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Sex
                </label>
                <button
                  onClick={() => setSex(sex === 'male' ? 'female' : 'male')}
                  className={cn(
                    "w-full py-3 rounded-xl border-2 transition-all font-medium flex items-center justify-center gap-3 h-[46px]",
                    sex === 'male' 
                      ? "border-theme-primary-light bg-theme-primary-bg text-theme-primary-text" 
                      : "border-pink-500 bg-pink-50 text-pink-700"
                  )}
                >
                  <div className={cn(
                    "w-10 h-5 bg-slate-200 rounded-full relative transition-colors",
                    sex === 'male' 
                      ? "bg-theme-primary-border" 
                      : "bg-pink-200"
                  )}>
                    <motion.div 
                      animate={{ x: sex === 'male' ? 2 : 22 }}
                      className={cn(
                        "absolute top-1 w-3 h-3 rounded-full shadow-sm",
                        sex === 'male' 
                          ? "bg-theme-primary" 
                          : "bg-pink-600"
                      )}
                    />
                  </div>
                  {sex === 'male' ? 'Male' : 'Female'}
                </button>
              </div>

              <div>
                <InputGroup
                  label="Weight"
                  value={weight}
                  onChange={setWeight}
                  placeholder={weightUnit === 'kg' ? "e.g. 70" : "e.g. 154"}
                  unit={weightUnit}
                  onUnitToggle={handleWeightUnitChange}
                  min={weightUnit === 'kg' ? LIMITS.weight.min : LIMITS.weightLb.min}
                  max={weightUnit === 'kg' ? LIMITS.weight.max : LIMITS.weightLb.max}
                  theme={theme}
                />
              </div>
            </div>

            <div className="space-y-4">
              {heightUnit === 'cm' ? (
                <InputGroup
                  label="Height"
                  value={height}
                  onChange={setHeight}
                  placeholder="e.g. 175"
                  unit="cm"
                  onUnitToggle={handleHeightUnitChange}
                  min={LIMITS.height.min}
                  max={LIMITS.height.max}
                  theme={theme}
                />
              ) : (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Height
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <input
                        type="number"
                        value={heightFt}
                        onChange={(e) => setHeightFt(e.target.value)}
                        className={cn(
                          "w-full border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 transition-all bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-theme-primary-shadow focus:border-theme-primary"
                        )}
                        placeholder="ft"
                      />
                      <input
                        type="number"
                        value={heightIn}
                        onChange={(e) => setHeightIn(e.target.value)}
                        className={cn(
                          "w-full border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 transition-all bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-theme-primary-shadow focus:border-theme-primary"
                        )}
                        placeholder="in"
                      />
                    </div>
                    <button
                      onClick={handleHeightUnitChange}
                      className={cn(
                        "border rounded-xl px-2 text-[10px] font-bold transition-colors min-w-[50px] active:scale-95 bg-white border-slate-200 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      ft/in
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="wait">
                {inputMode === 'hct' ? (
                  <motion.div
                    key="hct-input"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                  >
                    <InputGroup
                      label="Hematocrit"
                      value={hct}
                      onChange={(val) => {
                        setHct(val);
                        const h = parseFloat(val);
                        if (!isNaN(h)) setHgb((h / 3).toFixed(1));
                      }}
                      placeholder="e.g. 30"
                      icon={<Activity className="w-4 h-4" />}
                      unit="HCT %"
                      onUnitToggle={() => setInputMode('hgb')}
                      min={LIMITS.hct.min}
                      max={LIMITS.hct.max}
                      helper={`Equivalent to ~${hgb} g/dL Hgb`}
                      theme={theme}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="hgb-input"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                  >
                    <InputGroup
                      label="Hemoglobin"
                      value={hgb}
                      onChange={(val) => {
                        setHgb(val);
                        const h = parseFloat(val);
                        if (!isNaN(h)) setHct((h * 3).toFixed(1));
                      }}
                      placeholder="e.g. 10"
                      icon={<Activity className="w-4 h-4" />}
                      unit="HGB g/dL"
                      onUnitToggle={() => setInputMode('hct')}
                      min={LIMITS.hct.min / 3}
                      max={LIMITS.hct.max / 3}
                      helper={`Converts to ~${hct}% Hct (Hct ≈ 3 × Hgb)`}
                      theme={theme}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {calcMode === 'rbcx' && activeScenario && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 pt-4 border-t border-theme-card-border"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-theme-primary">
                    <Calculator className="w-4 h-4" />
                    <h3 className="text-xs font-black uppercase tracking-widest">Sickle Cell Parameters</h3>
                  </div>
                  <div className="text-[10px] font-bold text-theme-primary opacity-60 italic">
                    FCR = (Goal HbS / Initial HbS) × 100
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <InputGroup
                    label="Initial HgbS"
                    value={initialHgbS}
                    onChange={(val) => {
                      setInitialHgbS(val);
                      const iS = parseFloat(val);
                      const gS = parseFloat(goalHgbS);
                      if (iS > 0 && gS > 0) {
                        const fcr = (gS / iS) * 100;
                        setTargetFCR(fcr.toFixed(1));
                      }
                    }}
                    unit="%"
                    min={20}
                    max={100}
                    theme={theme}
                  />
                  <InputGroup
                    label="Goal HgbS"
                    value={goalHgbS}
                    onChange={(val) => {
                      setGoalHgbS(val);
                      const iS = parseFloat(initialHgbS);
                      const gS = parseFloat(val);
                      if (iS > 0 && gS > 0) {
                        const fcr = (gS / iS) * 100;
                        setTargetFCR(fcr.toFixed(1));
                      }
                    }}
                    unit="%"
                    min={1}
                    max={50}
                    theme={theme}
                  />
                </div>

                <div className="flex items-center gap-2 text-theme-primary mb-2 pt-4 border-t border-theme-card-border">
                  <Activity className="w-4 h-4" />
                  <h3 className="text-xs font-black uppercase tracking-widest">Exchange Parameters</h3>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <InputGroup
                    label="Min Hct (Depletion)"
                    value={minHct}
                    onChange={setMinHct}
                    placeholder="e.g. 25"
                    unit="%"
                    min={20}
                    max={45}
                    theme={theme}
                    helper="Target Hct after depletion phase"
                  />
                  <InputGroup
                    label="Target Hct (Final)"
                    value={targetHct}
                    onChange={setTargetHct}
                    placeholder="e.g. 30"
                    unit="%"
                    min={20}
                    max={45}
                    theme={theme}
                    helper="Final Hct after exchange phase"
                  />
                  <InputGroup
                    label="Target FCR"
                    value={targetFCR}
                    onChange={(val) => {
                      setTargetFCR(val);
                      const fcr = parseFloat(val);
                      const iS = parseFloat(initialHgbS);
                      if (fcr > 0 && iS > 0) {
                        const gS = (fcr / 100) * iS;
                        setGoalHgbS(gS.toFixed(1));
                      }
                    }}
                    placeholder="e.g. 30"
                    unit="%"
                    min={10}
                    max={50}
                    theme={theme}
                    helper="FCR = (Goal HbS / Initial HbS) × 100"
                  />
                  <InputGroup
                    label="Replacement Hct"
                    value={replacementHct}
                    onChange={setReplacementHct}
                    placeholder="e.g. 65"
                    unit="%"
                    min={50}
                    max={80}
                    theme={theme}
                    helper="Hct of replacement packed RBCs"
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Estimation Card */}
          {stats && (calcMode === 'tpe' || activeScenario || calcMode === 'depletion') && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "mt-8 p-6 rounded-3xl shadow-xl space-y-6 transition-all duration-500 bg-theme-primary-dark text-theme-primary-bg"
              )}
            >
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-theme-primary-light brightness-150">
                  <Activity className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    {calcMode === 'tpe' ? 'Estimated TBV' : calcMode === 'rbcx' ? 'Estimated Exchange Vol' : 'Volume to Remove'}
                  </span>
                </div>
                
                {calcMode === 'tpe' ? (
                  <>
                    <div className="text-4xl font-black tracking-tight text-white">
                      {Math.round(stats.tbv)}
                    </div>
                    <div className="text-xs font-bold text-theme-primary-light brightness-150">mL</div>
                  </>
                ) : calcMode === 'rbcx' ? (
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <div className="text-center border-r border-white/10 pr-4">
                      <div className="text-3xl font-black tracking-tight text-white">
                        {Math.round(stats.rbcxVolume)}
                      </div>
                      <div className="text-[10px] font-bold text-theme-primary-light brightness-150 uppercase">mL Exchange</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-black tracking-tight text-white">
                        {Math.ceil(stats.rbcxUnits)}
                      </div>
                      <div className="text-[10px] font-bold text-theme-primary-light brightness-150 uppercase">Units</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl font-black tracking-tight text-white">
                      {Math.round(stats.depletionVolume)}
                    </div>
                    <div className="text-xs font-bold text-theme-primary-light brightness-150">mL</div>
                  </>
                )}

                {calcMode === 'rbcx' && stats.depletionVolume > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10 flex justify-center gap-6">
                    <div className="text-center">
                      <div className="text-lg font-black text-white">
                        {Math.round(stats.depletionVolume)}
                      </div>
                      <div className="text-[9px] font-bold text-theme-primary-light brightness-125 uppercase tracking-widest opacity-80">
                        Depletion mL
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-black text-white">
                        {Math.round(stats.rbcxVolume)}
                      </div>
                      <div className="text-[9px] font-bold text-theme-primary-light brightness-125 uppercase tracking-widest opacity-80">
                        Exchange mL
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-black text-white">
                        {Math.round(stats.depletionVolume + stats.rbcxVolume)}
                      </div>
                      <div className="text-[9px] font-bold text-theme-primary-light brightness-125 uppercase tracking-widest opacity-80">
                        Total Fluid mL
                      </div>
                    </div>
                  </div>
                )}

                {calcMode === 'rbcx' && (
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="text-[9px] font-bold text-theme-primary-light brightness-125 uppercase tracking-widest opacity-80">
                      Approximate units assuming 350 mL RBCs per unit
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className={cn(
                  "p-3 rounded-2xl text-center border transition-colors bg-theme-primary-dark/50 border-theme-primary-light/20"
                )}>
                  <div className="text-[9px] font-bold text-theme-primary-light brightness-150 uppercase tracking-wider mb-1">TBV</div>
                  <div className={cn(
                    "text-sm font-bold text-white"
                  )}>{Math.round(stats.tbv)}</div>
                  <div className="text-[8px] text-theme-primary-light brightness-150 font-bold">mL</div>
                </div>
                <div className={cn(
                  "p-3 rounded-2xl text-center border transition-colors bg-theme-primary-dark/50 border-theme-primary-light/20"
                )}>
                  <div className="text-[9px] font-bold text-theme-primary-light brightness-150 uppercase tracking-wider mb-1">RCV</div>
                  <div className={cn(
                    "text-sm font-bold text-white"
                  )}>{Math.round(stats.rcv)}</div>
                  <div className="text-[8px] text-theme-primary-light brightness-150 font-bold">mL</div>
                </div>
                <div className={cn(
                  "p-3 rounded-2xl text-center border transition-colors bg-theme-primary-dark/50 border-theme-primary-light/20"
                )}>
                  <div className="text-[9px] font-bold text-theme-primary-light brightness-150 uppercase tracking-wider mb-1">BSA</div>
                  <div className={cn(
                    "text-sm font-bold text-white"
                  )}>{stats.bsa.toFixed(2)}</div>
                  <div className="text-[8px] text-theme-primary-light brightness-150 font-bold">m²</div>
                </div>
              </div>
            </motion.div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
      </main>
      <Chatbot 
        appData={{
          calcMode,
          patientData,
          stats,
          activeScenario
        }}
        theme={theme}
      />
    </div>
  );
}

function InputGroup({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  icon,
  helper,
  unit,
  onUnitToggle,
  min,
  max,
  theme
}: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void; 
  placeholder?: string;
  icon?: React.ReactNode;
  helper?: string;
  unit?: string;
  onUnitToggle?: () => void;
  min?: number;
  max?: number;
  theme?: string;
}) {
  const numValue = parseFloat(value);
  const isEmpty = value.trim() === '';
  const isInvalid = !isEmpty && isNaN(numValue);
  const isTooLow = !isNaN(numValue) && min !== undefined && numValue < min;
  const isTooHigh = !isNaN(numValue) && max !== undefined && numValue > max;
  const isError = isInvalid || isTooLow || isTooHigh;

  const getValidationMessage = () => {
    if (isInvalid) return 'Invalid format';
    if (isTooLow) return `Too low (min ${min})`;
    if (isTooHigh) return `Too high (max ${max})`;
    return null;
  };

  const validationMessage = getValidationMessage();

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className={cn(
          "text-[10px] font-bold uppercase tracking-widest text-slate-500"
        )}>
          {label}
        </label>
        {validationMessage && (
          <motion.span 
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[10px] font-bold text-red-500 flex items-center gap-1"
          >
            <AlertCircle className="w-3 h-3" />
            {validationMessage}
          </motion.span>
        )}
      </div>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          {icon && (
            <div className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 transition-colors",
              isError ? "text-red-400" : "text-slate-400"
            )}>
              {icon}
            </div>
          )}
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            min={min}
            max={max}
            step="any"
            className={cn(
              "w-full border rounded-xl py-3 px-4 focus:outline-none focus:ring-2 transition-all font-medium bg-white border-slate-200 text-slate-900 placeholder:text-slate-400",
              isError 
                ? "border-red-200 focus:ring-red-100 focus:border-red-400 text-red-700" 
                : "focus:ring-theme-primary-shadow focus:border-theme-primary",
              icon && "pl-11"
            )}
          />
        </div>
        {unit && (
          <button
            onClick={onUnitToggle}
            className={cn(
              "border rounded-xl px-2 text-[10px] font-bold transition-colors min-w-[50px] active:scale-95 bg-white border-slate-200",
              isError 
                ? "bg-red-50 border-red-200 text-red-600" 
                : "text-slate-600 hover:bg-slate-200"
            )}
          >
            {unit}
          </button>
        )}
      </div>
      {helper && <p className={cn("text-[10px] italic", isError ? "text-red-400" : "text-slate-400")}>{helper}</p>}
    </div>
  );
}
