import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowUpRight, ArrowDownLeft, Wallet, History, Search, X, Download, Building2, FileText } from 'lucide-react';
import { UserProfile, LoanProposal } from '../types';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function Statement({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<LoanProposal[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<LoanProposal | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'proposals'),
      where('userId', '==', profile.uid),
      where('status', '==', 'completed')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date().getTime();
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as LoanProposal))
        .filter(p => {
          const createdAt = new Date(p.createdAt).getTime();
          return (now - createdAt) <= (24 * 60 * 60 * 1000); // 24 hours
        });
      setProposals(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    return () => unsubscribe();
  }, [profile.uid]);

  const handleDownloadReceipt = (transaction: LoanProposal) => {
    const content = `
COMPROVANTE DE DEPÓSITO - EMPIRECRED
------------------------------------
ID: ${transaction.id}
DATA: ${new Date(transaction.createdAt).toLocaleString()}
VALOR: R$ ${transaction.approvedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
ORIGEM: Creditas Sociedade de Crédito Direto S/A
CNPJ: 32.997.490/0001-39
TIPO: Crédito em Conta
------------------------------------
Este documento serve como comprovante de operação financeira.
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprovante_${transaction.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <h1 className="text-lg font-bold">Extrato</h1>
          <div className="w-10" /> {/* Spacer */}
        </div>

        <div className="space-y-1">
          <p className="text-xs opacity-80 uppercase font-bold tracking-widest">Saldo disponível</p>
          <h2 className="text-3xl font-bold">
            R$ {profile.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
        </div>
      </header>

      <div className="px-4 -mt-6 space-y-6">
        {/* Search Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center space-x-3">
          <Search size={20} className="text-zinc-400" />
          <input 
            type="text" 
            placeholder="Buscar transações..." 
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-zinc-900 placeholder:text-zinc-400"
          />
        </div>

        {/* Transactions List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Histórico recente</h3>
            <History size={16} className="text-zinc-300" />
          </div>

          <div className="space-y-3">
            {proposals.length > 0 ? (
              proposals.map((p) => (
                <motion.div 
                  key={p.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedTransaction(p)}
                  className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                      <ArrowDownLeft size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900">Depósito Recebido</p>
                      <p className="text-[10px] text-zinc-400 font-medium">Creditas Sociedade de Crédito Direto S/A</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">+ R$ {p.approvedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-zinc-400">{new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 text-center space-y-4 shadow-sm">
                <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-300">
                  <Wallet size={32} />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-zinc-900">Nenhuma transação</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Você ainda não realizou nenhuma transação em sua conta EmpireCred.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction Details Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:p-4 sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTransaction(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-8 space-y-8 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">Detalhes do Depósito</h3>
                <button onClick={() => setSelectedTransaction(null)} className="text-zinc-400 p-2">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Valor Recebido</p>
                  <p className="text-4xl font-bold text-emerald-600">R$ {selectedTransaction.approvedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-zinc-50 rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400 uppercase">Origem</span>
                    <span className="text-xs font-bold text-zinc-900 text-right">Creditas Sociedade de Crédito Direto S/A</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400 uppercase">CNPJ</span>
                    <span className="text-xs font-bold text-zinc-900">32.997.490/0001-39</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400 uppercase">Data</span>
                    <span className="text-xs font-bold text-zinc-900">{new Date(selectedTransaction.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-400 uppercase">Tipo</span>
                    <span className="text-xs font-bold text-zinc-900">Crédito em Conta</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => handleDownloadReceipt(selectedTransaction)}
                    className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2"
                  >
                    <Download size={20} />
                    <span>Baixar Comprovante</span>
                  </button>
                  <button 
                    onClick={() => setSelectedTransaction(null)}
                    className="w-full py-4 text-zinc-400 font-bold text-sm"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
