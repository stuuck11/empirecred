import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, CheckCircle2, X, Camera, User, ArrowLeft, ArrowRight, Maximize, Minimize, Fingerprint } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
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

  const instructionData = [
    { text: "Centralize seu rosto", icon: <User size={24} /> },
    { text: "Afaste o rosto", icon: <Maximize size={24} /> },
    { text: "Aproxime o rosto", icon: <Minimize size={24} /> },
    { text: "Vire para a esquerda", icon: <ArrowLeft size={24} /> },
    { text: "Vire para a direita", icon: <ArrowRight size={24} /> }
  ];

  useEffect(() => {
    let interval: any;
    if (recording && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
        if ((40 - timeLeft) % 8 === 0) {
          const idx = Math.floor((40 - timeLeft) / 8) % instructionData.length;
          setInstruction(instructionData[idx].text);
        }
      }, 1000);
    } else if (timeLeft === 0 && recording) {
      stopRecording();
    }
    return () => clearInterval(interval);
  }, [recording, timeLeft]);

  const startVerification = () => {
    setError('');
    setStep(2);
  };

  useEffect(() => {
    if (step === 2 && !recording) {
      const initCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user',
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }, 
            audio: false 
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(console.error);
            };
          }
          
          const mimeType = MediaRecorder.isTypeSupported('video/mp4') 
            ? 'video/mp4' 
            : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
            
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: mimeType || undefined,
            videoBitsPerSecond: 5000000 // 5Mbps for high quality
          });
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

          mediaRecorder.start(1000);
          setRecording(true);
        } catch (e) {
          console.error("Camera error", e);
          setError("Erro ao acessar câmera. Verifique as permissões.");
          setStep(1);
        }
      };
      initCamera();
    }
  }, [step]);

  const uploadVideo = async (blob: Blob) => {
    if (blob.size === 0) {
      setError("O vídeo capturado está vazio. Tente novamente.");
      setStep(1);
      return;
    }
    
    setLoading(true);
    setStep(3); // Move to processing screen immediately
    try {
      const formData = new FormData();
      formData.append('cpf', profile.cpf || ''); // Send CPF for filename
      formData.append('video', blob, 'verification.mp4');

      const response = await fetch('/api/upload-verification', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Falha no upload: ${response.status} ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error('Resposta do servidor inválida (não JSON)');
      }

      const data = await response.json();
      const videoUrl = data.videoUrl;

      // Update User Profile
      const userRef = doc(db, 'users', profile.uid);
      await setDoc(userRef, { facialVerificationUrl: videoUrl }, { merge: true });
      
      // Create record in verifications collection for Admin Panel
      const verifId = 'verif-' + Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'verifications', verifId), {
        id: verifId,
        userId: profile.uid,
        userName: profile.fullName,
        userCpf: profile.cpf,
        videoUrl: videoUrl,
        status: 'Aprovado',
        timestamp: new Date().toISOString()
      });
      
      const updatedProfile = { ...profile, facialVerificationUrl: videoUrl };
      setProfile(updatedProfile);
      localStorage.setItem('empirecred_profile', JSON.stringify(updatedProfile));

      setVerificationId(verifId);
    } catch (e: any) {
      console.error("Upload error", e);
      setError(`Erro ao processar verificação: ${e.message || "Tente novamente"}`);
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
            <div className="text-center w-full px-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={instruction}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="bg-emerald-500 text-white px-8 py-4 rounded-2xl inline-flex items-center space-x-3 shadow-2xl shadow-emerald-500/40 border-2 border-white/20"
                >
                  <span className="animate-pulse">
                    {instructionData.find(i => i.text === instruction)?.icon}
                  </span>
                  <p className="font-black uppercase tracking-widest text-xl italic">{instruction}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative w-80 h-[400px] flex items-center justify-center">
              {/* Pulsing middle ring - Oval */}
              <motion.div 
                className="absolute inset-x-2 inset-y-4 border-2 border-emerald-500/20 rounded-[100%/120%]"
                animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Scanning line animation */}
              <motion.div 
                className="absolute left-8 right-8 h-1 bg-emerald-400/80 z-20 blur-[1px] rounded-full shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />

              {/* Corner markers - Oval style */}
              <div className="absolute inset-0 z-20 pointer-events-none">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <div className="absolute left-2 top-1/2 -translate-y-1/2 h-1 w-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 h-1 w-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              </div>

              <div className="relative w-72 h-[360px] overflow-hidden rounded-[100%/120%] border-4 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.3)] z-10">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover -scale-x-100"
                />
                
                {/* Overlay gradient for depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent pointer-events-none" />
                
                {/* Biometry grid overlay */}
                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #10b981 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              </div>
            </div>

            <div className="text-center space-y-4">
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6], scale: [0.98, 1, 0.98] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex items-center space-x-3 bg-zinc-800/80 px-6 py-3 rounded-full border border-emerald-500/30 backdrop-blur-sm shadow-xl"
              >
                <Fingerprint size={16} className="text-emerald-500 animate-pulse" />
                <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest">Análise Biométrica Ativa</p>
              </motion.div>
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
                <p className="text-sm font-bold text-emerald-500 uppercase tracking-widest animate-pulse">Analisando biometria...</p>
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
