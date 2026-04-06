import React, { useRef, useState, useCallback } from 'react';
import { Camera, X, Check, RefreshCw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import ReviewOCR from './ReviewOCR';

interface CameraOCRProps {
  onCapture: (data: any) => void;
  onClose: () => void;
}

type CaptureStep = 'stats' | 'details' | 'review' | 'done';

export default function CameraOCR({ onCapture, onClose }: CameraOCRProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<CaptureStep>('stats');
  const [accumulatedData, setAccumulatedData] = useState<any>({});

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please ensure permissions are granted.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  React.useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const processImage = async () => {
    if (!capturedImage) return;
    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const base64Data = capturedImage.split(',')[1];

      const statsPrompt = `Extract TPE procedure data from this "Procedure Stats" screen image from a Spectra Optia machine.
                Return a JSON object with the following fields. Use null if a field is not found.
                
                Fields and Formats:
                - firstName: string (Patient's first name)
                - lastName: string (Patient's last name)
                - patientId: string (Patient ID or PID#)
                - date: string (Format: MM-DD-YYYY. Usually located directly below the 'time' value)
                - time: string (Format: HH:mm, 24-hour)
                - startTime: string (Format: HH:mm)
                - endTime: string (Format: HH:mm)
                - acUsed: number (Total AC used in mL)
                - removeBag: number (Total volume in remove bag in mL)
                - replacementUsed: number (Total replacement fluid used in mL)
                - bolus: number (Total bolus volume in mL)
                - tubingSet: number (Tubing set volume in mL)
                - rinseback: number (Rinseback volume in mL)
                - runTime: number (Total run time in minutes)
                - fluidBalanceMl: number (Fluid balance in mL)
                - fluidBalancePercent: number (Fluid balance percentage)
                - inletProcessed: number (Total inlet volume processed in mL)
                
                Be extremely precise with numbers. If a number has a decimal, include it.`;

      const detailsPrompt = `Extract TPE procedure data from this "Exchange Details" screen image from a Spectra Optia machine.
                Return a JSON object with the following fields. Use null if a field is not found.
                
                Fields and Formats:
                - firstName: string
                - lastName: string
                - patientId: string
                - date: string (Format: MM-DD-YYYY)
                - time: string (Format: HH:mm)
                - plasmaVolumesExchanged: number (Number of plasma volumes exchanged)
                - plasmaRemoved: number (Total plasma removed in mL)
                - acInRemoveBag: number (AC volume in remove bag in mL)
                - acToPatient: number (AC volume delivered to patient in mL)
                - acUsedForPrime: number (AC used for priming in mL)
                - salineToPatientAir: number (Saline to patient/air in mL)
                - customPrime: number (Custom prime volume in mL)
                - salineRinse: number (Saline rinse volume in mL)
                
                Be extremely precise with numbers.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
              {
                text: currentStep === 'stats' ? statsPrompt : detailsPrompt,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: currentStep === 'stats' ? {
              firstName: { type: Type.STRING },
              lastName: { type: Type.STRING },
              patientId: { type: Type.STRING },
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
              date: { type: Type.STRING },
              time: { type: Type.STRING },
            } : {
              firstName: { type: Type.STRING },
              lastName: { type: Type.STRING },
              patientId: { type: Type.STRING },
              plasmaVolumesExchanged: { type: Type.NUMBER },
              plasmaRemoved: { type: Type.NUMBER },
              acInRemoveBag: { type: Type.NUMBER },
              acToPatient: { type: Type.NUMBER },
              acUsedForPrime: { type: Type.NUMBER },
              salineToPatientAir: { type: Type.NUMBER },
              customPrime: { type: Type.NUMBER },
              salineRinse: { type: Type.NUMBER },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              date: { type: Type.STRING },
              time: { type: Type.STRING },
            }
          }
        }
      });

      const text = response.text?.trim() || "{}";
      const extractedData = JSON.parse(text === "" ? "{}" : text);
      const newAccumulated = { ...accumulatedData, ...extractedData };
      
      if (currentStep === 'stats') {
        setAccumulatedData(newAccumulated);
        setCurrentStep('details');
        setCapturedImage(null);
        startCamera();
      } else {
        setAccumulatedData(newAccumulated);
        setCurrentStep('review');
      }
    } catch (err) {
      console.error("OCR Error:", err);
      setError("Failed to process image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleReviewChange = (key: string, value: any) => {
    setAccumulatedData((prev: any) => ({ ...prev, [key]: value }));
  };

  const confirmReview = () => {
    onCapture(accumulatedData);
    onClose();
  };

  if (currentStep === 'review') {
    return (
      <ReviewOCR 
        data={accumulatedData}
        onConfirm={confirmReview}
        onCancel={onClose}
        title="Review Extracted Data"
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-theme-card rounded-3xl overflow-hidden shadow-2xl relative border border-theme-card-border">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="aspect-[3/4] bg-black relative overflow-hidden">
          {!capturedImage && (
            <div className="absolute top-6 left-6 right-6 z-10">
              <div className="bg-theme-primary/90 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest text-center shadow-lg backdrop-blur-sm">
                {currentStep === 'stats' ? 'Step 1: Capture Procedure Stats' : 'Step 2: Capture Exchange Details'}
              </div>
            </div>
          )}
          {!capturedImage ? (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-white/30 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-theme-primary/50 rounded-2xl" />
              </div>
            </>
          ) : (
            <img 
              src={capturedImage} 
              alt="Captured" 
              className="w-full h-full object-cover"
            />
          )}

          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-theme-primary mb-4" />
              <p className="text-lg font-medium">Analyzing Screen...</p>
              <p className="text-sm text-white/60 mt-2">Gemini is extracting data from the image</p>
            </div>
          )}
        </div>

        <div className="p-6 flex items-center justify-center gap-4">
          {!capturedImage ? (
            <button 
              onClick={captureFrame}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 border-4 border-slate-900 rounded-full" />
            </button>
          ) : (
            <div className="flex gap-4 w-full">
              <button 
                onClick={retake}
                disabled={isProcessing}
                className="flex-1 py-4 bg-theme-bg text-theme-text rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-theme-card-border transition-colors disabled:opacity-50 border border-theme-card-border"
              >
                <RefreshCw className="w-5 h-5" />
                Retake
              </button>
              <button 
                onClick={processImage}
                disabled={isProcessing}
                className="flex-1 py-4 bg-theme-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 shadow-xl shadow-theme-primary/20"
              >
                <Check className="w-5 h-5" />
                {currentStep === 'stats' ? 'Next: Exchange Details' : 'Finish Capture'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-500/20 text-red-400 text-sm text-center border-t border-red-500/30">
            {error}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
