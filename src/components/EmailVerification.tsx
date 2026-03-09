import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mail, RefreshCcw, LogOut, CheckCircle2 } from 'lucide-react';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function EmailVerification({ user, onVerified }: { user: any, onVerified: () => void }) {
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    setLoading(true);
    setError('');
    try {
      await sendEmailVerification(auth.currentUser!);
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err: any) {
      setError('Erro ao reenviar email. Tente novamente mais tarde.');
    }
    setLoading(false);
  };

  const checkVerification = async () => {
    setLoading(true);
    try {
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        onVerified();
      } else {
        setError('Email ainda não verificado. Verifique sua caixa de entrada.');
      }
    } catch (err) {
      setError('Erro ao verificar status. Tente novamente.');
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6 border border-zinc-100"
      >
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
          <Mail size={40} />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-zinc-900">Verifique seu e-mail</h2>
          <p className="text-zinc-500 text-sm">
            Enviamos um link de confirmação para <strong>{user.email}</strong>. 
            Por favor, clique no link para liberar seu acesso.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        {resent && (
          <div className="p-3 bg-emerald-50 text-emerald-600 text-xs rounded-xl font-medium flex items-center justify-center space-x-2">
            <CheckCircle2 size={14} />
            <span>Email de verificação reenviado!</span>
          </div>
        )}

        <div className="space-y-3">
          <button 
            onClick={checkVerification}
            disabled={loading}
            className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? <RefreshCcw className="animate-spin" size={20} /> : <span>Já verifiquei meu e-mail</span>}
          </button>

          <button 
            onClick={handleResend}
            disabled={loading || resent}
            className="w-full bg-white text-zinc-600 py-4 rounded-2xl font-bold border border-zinc-100 hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            Reenviar e-mail de confirmação
          </button>

          <button 
            onClick={handleLogout}
            className="w-full text-zinc-400 py-2 text-sm font-bold flex items-center justify-center space-x-2 hover:text-zinc-600"
          >
            <LogOut size={16} />
            <span>Sair da conta</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
