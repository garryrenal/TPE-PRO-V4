/**
 * Base knowledge extracted from the provided clinical documents.
 * This information is used by the chatbot to provide accurate, 
 * evidence-based answers for apheresis procedures.
 */

export const KNOWLEDGE_BASE = {
  asfa2023: `
    ASFA 2023 GUIDELINES (Ninth Special Issue)
    
    METHODOLOGY:
    - Category I: First-line therapy.
    - Category II: Second-line therapy.
    - Category III: Optimum role not established.
    - Category IV: Ineffective or harmful.
    - Grade 1A: Strong recommendation, high-quality evidence.
    - Grade 1B: Strong recommendation, moderate-quality evidence.
    - Grade 1C: Strong recommendation, low-quality evidence.
    - Grade 2A/2B/2C: Weak recommendations.

    FACT SHEETS (Selected with Prevalence/Incidence):
    
    1. ACUTE DISSEMINATED ENCEPHALOMYELITIS (ADEM):
       - Incidence: <1/100,000/year (age <20); ~0.8/100,000/year (Preceptor).
       - Indication: Steroid refractory.
       - Procedure: TPE. Category: II. Grade: 2C.
       - Technical: 1-1.5 TPV, every other day. 5-7 procedures.
    
    2. ACUTE INFLAMMATORY DEMYELINATING POLYRADICULONEUROPATHY (GBS):
       - Incidence: 1 to 2/100,000/year; 1 in 100,000 (Preceptor).
       - Indication: Primary treatment.
       - Procedure: TPE (Cat I, 1A), IA (Cat I, 1B).
       - Technical: 1-1.5 TPV, every other day or daily. 5-6 treatments over 10-14 days.
    
    3. ACUTE LIVER FAILURE (ALF):
       - Incidence: <10/1,000,000/year.
       - Indication: Acute liver failure.
       - Procedure: TPE-HV (Cat I, 1A), TPE (Cat III, 2B).
       - Technical: TPE-HV target 8-12L exchange. Daily.
    
    4. ANTI-GLOMERULAR BASEMENT MEMBRANE DISEASE (Goodpasture's):
       - Prevalence: 10/1,000,000 hospitalized pts; 1 per 100,000/year (Preceptor).
       - Indication: DAH (Diffuse Alveolar Hemorrhage). Procedure: TPE. Category: I. Grade: 1C.
       - Indication: Dialysis-independence. Procedure: TPE. Category: I. Grade: 1B.
       - Technical: 1-1.5 TPV, daily initially.
    
    5. BABESIOSIS:
       - Prevalence: Endemic in US NE/Midwest; Rare (Preceptor).
       - Indication: Severe.
       - Procedure: RBC Exchange. Category: III. Grade: 2C.
       - Technical: 1-2 total RBC volumes. Single procedure.
    
    6. CATASTROPHIC ANTIPHOSPHOLIPID SYNDROME (CAPS):
       - Incidence: ~5 cases per 10,000,000/year; Very rare (Preceptor).
       - Indication: CAPS.
       - Procedure: TPE. Category: I. Grade: 2C.
       - Technical: 1-1.5 TPV, daily or every other day.
    
    7. COAGULATION FACTOR DEFICIENCY AND INHIBITORS:
       - Incidence: Factor VIII inhibitor <2/1,000,000/year.
       - Indication: Factor VIII inhibitor.
       - Procedure: IA (Cat III, 2B), TPE (Cat III, 2C).
       - Technical: Daily until bleeding controlled.
    
    8. CRYOGLOBULINEMIA:
       - Prevalence: ~50% of patients with chronic Hep C.
       - Indication: Severe/symptomatic.
       - Procedure: TPE/DFPP (Cat II, 2A), IA (Cat II, 2B).
       - Technical: 1-1.5 TPV, every 1-3 days.
    
    9. ERYTHROCYTOSIS:
       - Incidence: Polycythemia vera 1/100,000/year.
       - Indication: Polycythemia vera.
       - Procedure: Erythrocytapheresis. Category: I. Grade: 1B.
       - Technical: Volume based on TBV, starting Hct and target Hct (<45%).
    
    10. FAMILIAL HYPERCHOLESTEROLEMIA:
        - Prevalence: Heterozygotes 1/200-300; Homozygotes 1/1,000,000.
        - Indication: Homozygotes. Procedure: LA (Cat I, 1A).
        - Indication: Heterozygotes. Procedure: LA (Cat II, 1A).
        - Technical: Weekly or biweekly.
    
    11. MYASTHENIA GRAVIS:
        - Prevalence: 7 to 23/million; 1 per 100,000/year (Preceptor).
        - Indication: Acute, short-term treatment.
        - Procedure: TPE/DFPP/IA. Category: I. Grade: 1B.
        - Technical: 1-1.5 TPV, 5-6 treatments over 10-14 days.
    
    12. SICKLE CELL DISEASE (SCD):
        - Prevalence: 289/100,000 African Americans; 90/100,000 Hispanics (Preceptor).
        - Acute Stroke: RBC Exchange (Cat I, 1C).
        - Acute Chest Syndrome: RBC Exchange (Cat II, 1C).
        - Technical: Target HbS < 30%, End Hct 30 ± 3%.
    
    13. THROMBOTIC THROMBOCYTOPENIC PURPURA (TTP):
        - Incidence: 0.37 per 100,000/year (Preceptor).
        - Indication: TTP.
        - Procedure: TPE. Category: I. Grade: 1A.
        - Technical: 1-1.5 TPV, daily until Plt > 150k and LDH normal for 2-3 days.
    
    14. VASCULITIS, ANCA-ASSOCIATED (GPA):
        - Incidence: 0.85 per 100,000/year (Preceptor).
        - Indication: Microscopic polyangiitis.
        - Procedure: TPE. Category: III. Grade: 1B.
        - Technical: 1-1.5 TPV, daily or every other day.

    15. HEMOPHAGOCYTIC LYMPHOHISTIOCYTOSIS (HLH):
        - Incidence: 1/800,000/year (adults); 1/1,000,000/year (children).
        - Procedure: TPE. Category: III. Grade: 2C.

    16. NEUROMYELITIS OPTICA (NMOSD):
        - Incidence: <1/100,000/year.
        - Procedure: TPE (Cat II, 1B), IA (Cat II, 1C).

    17. PEMPHIGUS VULGARIS:
        - Incidence: 12/100,000/year (US).
        - Procedure: TPE. Category: III. Grade: 2B.

    18. SEPSIS WITH MULTIORGAN FAILURE:
        - Incidence: 300/100,000/year (adults); 8% prevalence in pediatric ICU.
        - Procedure: TPE (Cat III, 2A).

    19. STIFF-PERSON SYNDROME:
        - Prevalence: <1/1,000,000/year.
        - Procedure: TPE (Cat III, 2C).

    20. WILSON DISEASE:
        - Incidence: 1/30,000 to 40,000.
        - Procedure: TPE (Cat I, 1C).
  `,
  
  preceptorGuide: `
    PRECEPTOR GUIDE - ACUTE APHERESIS
    
    Calculations:
    - Total Blood Volume (TBV): Weight (kg) x 70 mL/kg (Adults).
    - Red Cell Volume (RCV): TBV x Hematocrit % (0.xx).
    - Plasma Volume (PV): TBV - RCV.
    
    RBC Exchange Calculation:
    1. Determine target FCR (Fraction of Cells Remaining).
    2. RBC units assume ~350 mL per unit.
    3. 1.5 RBC replacement volume = RCV x 1.5.
    
    Anticoagulation (ACD-A):
    - Default rate: 0.8 mL/min/L of TBV for Spectra Optia.
    - Inlet:AC ratio: Usually 10:1 to 13:1 for TPE, up to 15:1.
    - Citrate toxicity management: assess for paresthesia, tingling, restlessness.
    
    Vascular Access:
    - Peripheral access: 17G needle minimum for inlet. 19G minimum for return to prevent hemolysis.
    - CVC: monitor for high negative arterial pressure (>-260 mmHg).

    DISEASE STATS (Preceptor Guide):
    - ADEM: ~0.8 per 100,000/year.
    - AIHA: 1 per 100,000/year.
    - ANCA GPA: 0.85 per 100,000/year.
    - Anti-GBM: 1 per 100,000/year.
    - Babesiosis: Rare, but more prevalent in NE and Great Lakes.
    - CAPS: Very rare.
    - CTCL: 0.3 to 1 per 100,000/year.
    - Coagulation factor inhibitor: 20-30% in Hemophilia A.
    - Familial Hypercholesterolemia: Hetero 200 per 100,000; Homo 1 in 1,000,000.
    - FSGS: Rare.
    - GBS: 1 in 100,000.
    - GVHD: 13 to 63% acute; 6 to 80% chronic.
    - Hyperviscosity: 0.1 to 0.3 per 100,000/year.
    - ITP: 38 per 100,000/year (adult); 46 per 100,000/year (child).
    - MG: 1 per 100,000/year.
    - Myeloma Cast Nephropathy: 1 per 100,000/year.
    - NMOSD: Rare.
    - Paraproteinemic Polyneuropathy: MGUS 3% of pop > 50 yrs.
    - SCD: 289 per 100,000 African Americans; 90 per 100,000 Hispanics.
    - SLE: 15 to 50 per 100,000.
    - Sepsis: 300 per 100,000/year.
    - Stiff-person syndrome: < 1 per million.
    - TMA: 50 in 100,000 users of Ticlopidine/Clopidogrel.
    - TTP: 0.37 per 100,000/year.
    - Thrombocytosis: 22-24 per 100,000.
    - Thyroid storm: Rare.
  `,

  dialysisOfDrugs: `
    BAILIE AND MASON'S 2022 DIALYSIS OF DRUGS
    
    Key for Dialyzability:
    - Yes: Dialysis enhances plasma clearance by 30% or more during a typical 4-hour dialysis period. Supplemental dosing may be required or dosing after dialysis should be considered.
    - No: Dialysis enhances plasma clearance by less than 30%. Supplemental dosing is usually not required.
    - U: No published data exist but significant drug removal is unlikely based on physicochemical characteristics (protein binding, molecular size, volume of distribution).
    - L: No published data exist, but physicochemical characteristics suggest significant removal is likely.
    - ND: No data on drug dialyzability with this type of dialysis.
    
    Note: For detailed drug-specific information, refer to the full guide or www.renalpharmacyconsultants.com.
  `
};
