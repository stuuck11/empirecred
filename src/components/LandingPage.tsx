import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ArrowRight, CreditCard, Car, Lock, User } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

interface LandingPageProps {
  onLogin: (user: any, profile: any) => void;
}

export default function LandingPage({ onLogin }: LandingPageProps) {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      
      // Delay for 5 seconds
      setTimeout(() => {
        setLoading(false);
        navigate('/dashboard');
      }, 5000);
    } catch (error: any) {
      console.error("Login error:", error);
      let msg = "Verifique suas credenciais.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        msg = "E-mail ou senha incorretos.";
      } else if (error.code === 'auth/too-many-requests') {
        msg = "Muitas tentativas. Tente novamente mais tarde.";
      }
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-8 bg-zinc-50">
      <AnimatePresence mode="wait">
        {!showLogin ? (
          <motion.div 
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm space-y-8"
          >
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="flex justify-center">
                  <div className="w-24 h-24 flex items-center justify-center overflow-hidden">
                    <img src="https://imgur.com/tOniE14.png" alt="EmpireCred Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-black font-display">empirecred</h1>
              </div>
              <p className="text-zinc-500 max-w-xs mx-auto">
                Sua plataforma de crédito pessoal e com garantia veicular de forma simples e rápida.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 w-full">
              <div className="p-4 bg-white rounded-2xl border border-zinc-100 flex items-center space-x-4 shadow-sm">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <CreditCard className="text-emerald-600 w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Crédito Pessoal</p>
                  <p className="text-xs text-zinc-400">Taxas a partir de 2.89% a.m.</p>
                </div>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-zinc-100 flex items-center space-x-4 shadow-sm">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Car className="text-blue-600 w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Garantia Veicular</p>
                  <p className="text-xs text-zinc-400">Use seu carro como garantia.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/register')}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-semibold flex items-center justify-center space-x-2 shadow-xl"
              >
                <span>Começar Agora</span>
                <ArrowRight className="w-5 h-5" />
              </motion.button>

              <button 
                onClick={() => setShowLogin(true)}
                className="text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Já tenho conta
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm space-y-8"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Bem-vindo de volta</h2>
              <p className="text-zinc-500 text-sm">Acesse sua conta para continuar.</p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-medium text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Email</label>
                <div className="relative">
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-white border border-zinc-100 rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="seu@email.com"
                  />
                  <User className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-300" size={18} />
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Senha</label>
                <div className="relative">
                  <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white border border-zinc-100 rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                  <Lock className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-300" size={18} />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="relative w-5 h-5">
                      <div className="absolute inset-0 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                    <span>Entrando...</span>
                  </div>
                ) : 'Entrar'}
              </button>
            </form>

            <div className="pt-4 border-t border-zinc-100 space-y-4">
              <button 
                onClick={() => setShowLogin(false)}
                className="text-sm font-bold text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                Voltar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pt-8 border-t border-zinc-100 space-y-4 w-full max-w-xs">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest">EMPIRE CONSULTORIA E ASSESSORIA EMPRESARIAL LTDA</p>
          <p className="text-[10px] text-zinc-500 font-medium">CNPJ: 23.507.279/0001-08</p>
        </div>
        <p className="text-[9px] text-zinc-400 uppercase tracking-widest leading-relaxed">
          Esta plataforma atua como correspondente bancário. A concessão de crédito é realizada por instituições financeiras parceiras.
        </p>
        <div className="flex justify-center space-x-4 pt-2">
          <button onClick={() => navigate('/privacy')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 uppercase tracking-widest">Privacidade</button>
          <button onClick={() => navigate('/terms')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 uppercase tracking-widest">Termos</button>
        </div>
      </div>
    </div>
  );
}
