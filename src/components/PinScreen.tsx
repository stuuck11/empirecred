import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Lock, ChevronLeft, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

interface PinScreenProps {
  profile: UserProfile;
  onVerified: () => void;
  onLogout: () => void;
  initialMode?: PinMode;
}

type PinMode = 'entry' | 'setup' | 'confirm' | 'change_request';

export default function PinScreen({ profile, onVerified, onLogout, initialMode }: PinScreenProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PinMode>(initialMode || (profile.pin ? 'entry' : 'setup'));
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Auto focus first input
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [mode]);

  const handlePinChange = (index: number, value: string, isConfirm: boolean = false) => {
    if (!/^\d*$/.test(value)) return;

    const currentPin = isConfirm ? [...confirmPin] : [...pin];
    currentPin[index] = value.slice(-1);

    if (isConfirm) {
      setConfirmPin(currentPin);
    } else {
      setPin(currentPin);
    }

    // Move to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (value && index === 5) {
      // Auto confirm
      setTimeout(() => {
        const pinString = currentPin.join('');
        
        if (mode === 'entry') {
          if (pinString === profile.pin) {
            onVerified();
          } else {
            setError('Senha incorreta');
            setPin(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
          }
        } else if (mode === 'setup') {
          setPin(currentPin);
          setMode('confirm');
          inputRefs.current[0]?.focus();
        } else if (mode === 'confirm') {
          const setupPinString = pin.join('');
          if (pinString === setupPinString) {
            handleConfirm(pinString);
          } else {
            setError('As senhas não coincidem');
            setConfirmPin(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
          }
        }
      }, 100);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleConfirm = async (forcedConfirmPin?: string) => {
    setError(null);
    const pinString = pin.join('');
    
    if (pinString.length < 6 && mode !== 'confirm') {
      setError('A senha deve ter 6 dígitos');
      return;
    }

    if (mode === 'entry') {
      if (pinString === profile.pin) {
        onVerified();
      } else {
        setError('Senha incorreta');
        setPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } else if (mode === 'setup') {
      setMode('confirm');
      inputRefs.current[0]?.focus();
    } else if (mode === 'confirm') {
      const confirmPinString = forcedConfirmPin || confirmPin.join('');
      if (pinString === confirmPinString) {
        setLoading(true);
        try {
          await updateDoc(doc(db, 'users', profile.uid), {
            pin: pinString
          });
          if (initialMode === 'change_request') {
            navigate('/profile');
          } else {
            onVerified();
          }
        } catch (err) {
          console.error("Error saving PIN:", err);
          setError('Erro ao salvar senha');
        } finally {
          setLoading(false);
        }
      } else {
        setError('As senhas não coincidem');
        setConfirmPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    }
  };

  if (mode === 'change_request') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-between p-6">
        <div className="w-full flex justify-start">
          <button onClick={() => navigate(-1)} className="p-2">
            <X size={24} className="text-zinc-900" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center space-y-8 text-center max-w-xs">
          <div className="relative">
            <div className="w-32 h-32 bg-emerald-500 rounded-3xl flex items-center justify-center">
              <Lock size={64} className="text-white" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-zinc-100 rounded-full border-4 border-white flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </motion.div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">Troque sua senha</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Seu pedido de troca de senha vai passar por uma análise de até 1 hora. Isso é importante para manter sua conta segura.
            </p>
          </div>
        </div>

        <div className="w-full space-y-3">
          <button 
            onClick={() => {
              // In a real app, this would trigger the analysis process
              // For now, let's just show a message or redirect
              setError("Solicitação enviada. Aguarde a análise.");
              setTimeout(() => setMode('entry'), 3000);
            }}
            className="w-full py-4 bg-emerald-500 text-white font-bold rounded-full shadow-lg shadow-emerald-200"
          >
            Trocar senha
          </button>
          <button 
            onClick={() => navigate(-1)}
            className="w-full py-4 bg-zinc-100 text-zinc-900 font-bold rounded-full"
          >
            Voltar pro início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col p-6">
      <div className="w-full flex justify-start mb-8">
        <button 
          onClick={() => {
            if (initialMode === 'change_request') {
              navigate('/profile');
            } else {
              onLogout();
            }
          }} 
          className="p-2 -ml-2"
        >
          <ChevronLeft size={24} className="text-zinc-900" />
        </button>
      </div>

      <div className="flex-1 flex flex-col space-y-12">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-zinc-900">
            {mode === 'entry' ? 'Digite a senha de 6 números' : 
             mode === 'setup' ? 'Crie sua senha de 6 números' : 
             'Confirme sua senha de 6 números'}
          </h2>
          <p className="text-zinc-500 text-sm">
            {mode === 'entry' ? 'Para acessar sua conta com segurança' : 
             'Esta senha será solicitada sempre que você entrar no app'}
          </p>
        </div>

        <div className="flex justify-between gap-2">
          {(mode === 'confirm' ? confirmPin : pin).map((digit, index) => (
            <input
              key={index}
              ref={el => inputRefs.current[index] = el}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handlePinChange(index, e.target.value, mode === 'confirm')}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className={`w-12 h-16 text-center text-2xl font-bold rounded-xl border-2 transition-all outline-none pin-input
                ${digit ? 'border-emerald-500 bg-emerald-50/50' : 'border-zinc-200 focus:border-emerald-500 bg-zinc-50'}`}
            />
          ))}
        </div>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center space-x-2 text-red-500 bg-red-50 p-4 rounded-xl"
            >
              <AlertCircle size={18} />
              <span className="text-sm font-medium">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full space-y-3 mt-auto">
        <button 
          onClick={handleConfirm}
          disabled={loading || (mode === 'confirm' ? confirmPin : pin).some(d => !d)}
          className={`w-full py-4 font-bold rounded-full shadow-lg transition-all
            ${(mode === 'confirm' ? confirmPin : pin).every(d => d) 
              ? 'bg-emerald-500 text-white shadow-emerald-200' 
              : 'bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none'}`}
        >
          {loading ? 'Processando...' : 'Confirmar'}
        </button>
        
        {mode === 'entry' && (
          <button 
            onClick={() => setMode('change_request')}
            className="w-full py-4 bg-zinc-100 text-zinc-900 font-bold rounded-full"
          >
            Esqueci minha senha
          </button>
        )}
      </div>
    </div>
  );
}
