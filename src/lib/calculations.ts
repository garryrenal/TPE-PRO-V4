/**
 * Blood Volume Calculation Logic
 * Based on Nadler formula and standard clinical formulas.
 */

export type Sex = 'male' | 'female';

export interface PatientData {
  sex: Sex;
  height: number;
  heightUnit: 'cm' | 'in';
  weight: number;
  weightUnit: 'kg' | 'lb';
  hct: number; // percentage (e.g., 30)
}

export interface RBCXParams {
  targetHct: number;
  targetFCR: number; // Fraction of Cells Remaining (e.g., 30)
  replacementHct: number; // Hct of packed RBCs (e.g., 65)
}

/**
 * Calculates Total Blood Volume (TBV) using the Nadler formula:
 * Male: BV = 0.3669 * h³ + 0.03219 * w + 0.6041
 * Female: BV = 0.3561 * h³ + 0.03308 * w + 0.1833
 * Results are converted from Liters to mL.
 */
export function calculateTBV(patient: PatientData): number {
  const { sex, height, heightUnit, weight, weightUnit } = patient;

  const hMeters = heightUnit === 'cm' ? height / 100 : height * 0.0254;
  const wKg = weightUnit === 'kg' ? weight : weight * 0.453592;

  let bvLiters: number;
  if (sex === 'male') {
    bvLiters = (0.3669 * Math.pow(hMeters, 3)) + (0.03219 * wKg) + 0.6041;
  } else {
    bvLiters = (0.3561 * Math.pow(hMeters, 3)) + (0.03308 * wKg) + 0.1833;
  }

  return bvLiters * 1000; // Convert to mL
}

/**
 * Calculates Body Surface Area (BSA) using Mosteller formula.
 */
export function calculateBSA(heightCm: number, weightKg: number): number {
  return Math.sqrt((heightCm * weightKg) / 3600);
}

