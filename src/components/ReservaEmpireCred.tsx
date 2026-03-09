import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Sparkles, TrendingUp, Shield, Plus, AlertCircle } from 'lucide-react';
import { UserProfile } from '../types';

export default function ReservaEmpireCred({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMoney = () => {
    if (profile.balance <= 0) {
      setError('Você precisa ter saldo em conta para realizar um depósito na reserva.');
      return;
    }
    setLoading(true);
    setError(null);
    setTimeout(() => {
      setLoading(false);
      setError('esta funcionalidade não está disponível ainda');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#F5F7F9] pb-24 font-sans">
      {/* Header */}
      <header className="bg-[#008542] px-6 pt-8 pb-12 text-white">
        <div className="flex items-center justify-between mb-6">
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm"
          >
            <ChevronLeft size={24} />
          </motion.button>
          <h1 className="text-lg font-bold">Reserva EmpireCred</h1>
          <div className="w-10" /> {/* Spacer */}
        </div>

        <div className="space-y-1">
          <p className="text-xs opacity-80 uppercase font-bold tracking-widest">Saldo em reserva</p>
          <h2 className="text-3xl font-bold">
            R$ 0,00
          </h2>
        </div>
      </header>

      <div className="px-4 -mt-6 space-y-6">
        {/* Yield Info Card */}
        <div className="bg-white rounded-[32px] p-6 shadow-sm border border-zinc-100 space-y-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#008542]">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="font-bold text-zinc-900">Rendimento Diário</p>
              <p className="text-xs text-zinc-500">Seu dinheiro rende 100% da taxa SELIC.</p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-50">
            <h3 className="text-sm font-bold text-zinc-900">Como funciona?</h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center text-[#008542] mt-0.5">
                  <Sparkles size={12} />
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Ao colocar seu dinheiro na Reserva EmpireCred, ele passa a render automaticamente todos os dias úteis.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center text-[#008542] mt-0.5">
                  <Shield size={12} />
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  O rendimento segue a taxa SELIC, garantindo uma rentabilidade superior à poupança tradicional com a segurança do EmpireCred.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button 
              onClick={handleAddMoney}
              disabled={loading}
              className="w-full bg-[#008542] text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-100 flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full"
                />
              ) : (
                <>
                  <Plus size={20} />
                  <span>Colocar Dinheiro</span>
                </>
              )}
            </button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-center space-x-3 text-red-600"
              >
                <AlertCircle size={20} />
                <p className="text-xs font-bold uppercase tracking-widest">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Security Info */}
        <div className="bg-zinc-900 rounded-[32px] p-6 text-white space-y-4">
          <div className="flex items-center space-x-3">
            <Shield size={20} className="text-emerald-500" />
            <p className="font-bold text-sm">Segurança Garantida</p>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            Seus investimentos na Reserva EmpireCred são protegidos e você pode resgatar seu saldo a qualquer momento, sem carência.
          </p>
        </div>
      </div>
    </div>
  );
}
