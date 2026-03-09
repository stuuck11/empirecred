import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, CheckCircle2, X, Camera } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';

export default function FacialVerification({ profile, setProfile }: { profile: UserProfile, setProfile: (p: UserProfile) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(1);
  const [instruction, setInstruction] = useState('Centralize seu rosto');
  const [timeLeft, setTimeLeft] = useState(40);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationId, setVerificationId] = useState('');
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const instructions = [
    "Centralize seu rosto",
    "Afaste o rosto",
    "Aproxime o rosto",
    "Vire para a esquerda",
    "Vire para a direita"
  ];

  useEffect(() => {
    let interval: any;
    if (recording && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
        if ((40 - timeLeft) % 8 === 0) {
          setInstruction(instructions[Math.floor((40 - timeLeft) / 8) % instructions.length]);
        }
      }, 1000);
    } else if (timeLeft === 0 && recording) {
      stopRecording();
    }
    return () => clearInterval(interval);
  }, [recording, timeLeft]);

  const startVerification = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
      }
      
      const mimeType = MediaRecorder.isTypeSupported('video/mp4') 
        ? 'video/mp4' 
        : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
        
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const finalType = mimeType || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: finalType });
        await uploadVideo(blob);
      };

      mediaRecorder.start(1000); // Collect data every second
      setRecording(true);
      setStep(2);
    } catch (e) {
      console.error("Camera error", e);
      setError("Erro ao acessar câmera. Verifique as permissões.");
    }
  };

  const uploadVideo = async (blob: Blob) => {
    setLoading(true);
    setStep(3); // Move to processing screen immediately
    try {
      const formData = new FormData();
      formData.append('video', blob, 'verification.mp4');

      const response = await fetch('/api/upload-verification', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Falha no upload do vídeo');

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response received:', text.substring(0, 100));
        throw new Error('O servidor retornou uma resposta inválida (não JSON). Verifique se o servidor está rodando corretamente.');
      }

      const data = await response.json();
      const videoUrl = data.videoUrl;

      // Update Firestore
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, { facialVerificationUrl: videoUrl });
      
      const updatedProfile = { ...profile, facialVerificationUrl: videoUrl };
      setProfile(updatedProfile);
      localStorage.setItem('empirecred_profile', JSON.stringify(updatedProfile));

      setVerificationId('verif-' + Math.random().toString(36).substr(2, 9));
      setStep(3);
    } catch (e) {
      console.error("Upload error", e);
      setError("Erro ao processar verificação. Tente novamente.");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleBack = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6 flex flex-col relative">
      <button 
        onClick={handleBack}
        className="absolute top-6 right-6 w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors z-50"
      >
        <X size={20} />
      </button>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center space-y-8 text-center"
          >
            <div className="w-24 h-24 flex items-center justify-center overflow-hidden">
              <img src="https://imgur.com/tOniE14.png" alt="EmpireCred Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Verificação Biométrica</h2>
              <p className="text-zinc-400 text-sm max-w-xs mx-auto">
                Para sua segurança, precisamos realizar uma breve verificação facial. Siga as instruções na tela.
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="w-full space-y-3">
              <button 
                onClick={startVerification}
                className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-xl shadow-emerald-500/20"
              >
                Iniciar Verificação
              </button>
              <button 
                onClick={() => navigate('/simulate', { state: { ...location.state, verified: true }, replace: true })}
                className="w-full bg-zinc-800 text-zinc-400 py-4 rounded-2xl font-bold text-sm"
              >
                Pular (Apenas Teste)
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-between py-12"
          >
            <div className="text-center space-y-2">
              <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs">{instruction}</p>
              <p className="text-4xl font-mono font-bold">{timeLeft}s</p>
            </div>

            <div className="relative w-72 h-72">
              <div className="absolute inset-0 border-4 border-emerald-500 rounded-full z-10 animate-pulse"></div>
              <video 
                ref={videoRef} 
                autoPlay 
                muted 
                playsInline 
                className="w-full h-full object-cover rounded-full bg-zinc-800"
              />
            </div>

            <div className="text-center space-y-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Gravando automaticamente...</p>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="step3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center space-y-8 text-center"
          >
            {loading ? (
              <div className="space-y-6 flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 border-[3px] border-emerald-500/20 rounded-full"></div>
                  <motion.div 
                    className="absolute inset-0 border-[3px] border-emerald-500 border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                <p className="text-sm font-bold text-emerald-500 uppercase tracking-widest animate-pulse">Processando vídeo...</p>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
                  <CheckCircle2 size={48} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">Verificação concluída</h2>
                  <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs">Status: Aprovado</p>
                  <p className="text-zinc-500 text-[10px] font-mono">ID: {verificationId}</p>
                </div>
                <button 
                  onClick={() => navigate('/simulate', { state: { ...location.state, verified: true }, replace: true })}
                  className="w-full bg-white text-zinc-900 py-4 rounded-2xl font-bold"
                >
                  Continuar Simulação
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
