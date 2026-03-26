import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Users, FileText, Shield, Plus, Trash2, ArrowLeft, Edit2, Save, Check, X, TrendingUp, Download, Activity, Clock, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, X as CloseIcon, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, getDoc, query, where, getDocs, deleteField } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { AppConfig, UserProfile, LoanProposal, RevenueRequest, FacialVerification as FVType } from '../types';

export default function AdminPanel({ profile }: { profile: UserProfile | null }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'users' | 'proposals' | 'verifications' | 'revenue' | 'documents'>('dashboard');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [now, setNow] = useState(new Date());
  
  // Dashboard States
  type TimeRange = 'today' | 'yesterday' | 'before_yesterday' | '7d' | 'all';
  const [globalRange, setGlobalRange] = useState<TimeRange>('all');
  const [showConversionLogic, setShowConversionLogic] = useState(false);
  const [hideFees, setHideFees] = useState(false);
  const [onlineInterval, setOnlineInterval] = useState(5); // minutes
  const [cardRanges, setCardRanges] = useState({
    users: 'all' as TimeRange,
    proposals: 'all' as TimeRange,
    revenue: 'all' as TimeRange,
    approval: 'all' as TimeRange
  });

  const handleGlobalRangeChange = (range: TimeRange) => {
    setGlobalRange(range);
    setCardRanges({
      users: range,
      proposals: range,
      revenue: range,
      approval: range
    });
  };

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [proposals, setProposals] = useState<LoanProposal[]>([]);
  const [revenueRequests, setRevenueRequests] = useState<RevenueRequest[]>([]);
  const [verifications, setVerifications] = useState<FVType[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    facialVerificationEnabled: true,
    banners: [
      'https://jpcredito.b-cdn.net/banners/banner_1755022693376.png',
      'https://picsum.photos/seed/finance1/800/400'
    ],
    creditBannerUrl: 'https://picsum.photos/seed/credit/800/400',
    platformFee: 29.90,
    autoReleaseTime: 60
  });
  const [proposalFilter, setProposalFilter] = useState<'pending' | 'approved' | 'rejected' | 'waiting_proof' | 'paid' | 'completed'>('pending');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'user' | 'revenue' | 'proposal', id: string, data?: any } | null>(null);
  const [proofRequest, setProofRequest] = useState<RevenueRequest | null>(null);
  const [proofMessage, setProofMessage] = useState('Envie pelo menos um documento para comprovar seu faturamento.');
  const [proofTime, setProofTime] = useState({ h: '24', m: '00', s: '00' });
  const [confirmRelease, setConfirmRelease] = useState<LoanProposal | null>(null);
  const processingProposals = React.useRef<Set<string>>(new Set());

  const getStats = (range: TimeRange = 'all') => {
    const nowTime = now.getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
    const startOfBeforeYesterday = startOfToday - (2 * 24 * 60 * 60 * 1000);
    
    let startTime = 0;
    let endTime = Infinity;

    if (range === 'today') startTime = startOfToday;
    else if (range === 'yesterday') { startTime = startOfYesterday; endTime = startOfToday; }
    else if (range === 'before_yesterday') { startTime = startOfBeforeYesterday; endTime = startOfYesterday; }
    else if (range === '7d') startTime = startOfToday - (7 * 24 * 60 * 60 * 1000);

    const filteredUsers = range === 'all' ? users : users.filter(u => {
      if (!u.createdAt) return false;
      const time = new Date(u.createdAt).getTime();
      return time >= startTime && time < endTime;
    });
    const filteredProposals = range === 'all' ? proposals : proposals.filter(p => {
      if (!p.createdAt) return false;
      const time = new Date(p.createdAt).getTime();
      return time >= startTime && time < endTime;
    });

    const onlineUsers = users.filter(u => {
      if (!u.lastSeen) return false;
      const lastSeen = new Date(u.lastSeen).getTime();
      return (nowTime - lastSeen) <= (onlineInterval * 60 * 1000);
    }).length;

    const totalProposals = new Set(filteredProposals.map(p => p.userId)).size;
    const approvedProposals = new Set(filteredProposals.filter(p => ['approved', 'completed', 'paid'].includes(p.status)).map(p => p.userId)).size;
    const pendingProposals = new Set(filteredProposals.filter(p => p.status === 'pending').map(p => p.userId)).size;
    const rejectedProposals = new Set(filteredProposals.filter(p => p.status === 'rejected').map(p => p.userId)).size;
    
    const approvalRate = totalProposals > 0 ? (approvedProposals / totalProposals) * 100 : 0;

    const totalFeesPaid = filteredProposals
      .filter(p => p.status === 'paid' || p.status === 'completed')
      .length * (config.platformFee || 29.90);

    const avgFee = approvedProposals > 0 ? totalFeesPaid / approvedProposals : 0;

    // Growth comparison (Today vs Yesterday)
    const usersToday = users.filter(u => u.createdAt && new Date(u.createdAt).getTime() >= startOfToday).length;
    const usersYesterday = users.filter(u => {
      if (!u.lastSeen) return false;
      const time = new Date(u.createdAt).getTime();
      return time >= startOfYesterday && time < startOfToday;
    }).length;

    return {
      totalUsers: filteredUsers.length,
      onlineUsers,
      totalProposals,
      approvedProposals,
      pendingProposals,
      rejectedProposals,
      approvalRate,
      totalFeesPaid,
      avgFee,
      usersToday,
      usersYesterday
    };
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const stats = getStats();

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          uid: doc.id,
          balance: data.balance || 0,
          role: data.role || 'user',
          fullName: data.fullName || '',
          cpf: data.cpf || '',
          email: data.email || ''
        } as UserProfile;
      });
      setUsers(usersList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubscribeProposals = onSnapshot(collection(db, 'proposals'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoanProposal));
      // Sort by most recent first
      const sortedList = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setProposals(sortedList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'proposals');
    });

    const unsubscribeRevenue = onSnapshot(collection(db, 'revenue_requests'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RevenueRequest));
      setRevenueRequests(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'revenue_requests');
    });

    const unsubscribeVerifications = onSnapshot(collection(db, 'verifications'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FVType));
      setVerifications(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'verifications');
    });

    const unsubscribeConfig = onSnapshot(doc(db, 'config', 'app'), (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as AppConfig);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/app');
    });

    return () => {
      unsubscribeUsers();
      unsubscribeProposals();
      unsubscribeRevenue();
      unsubscribeVerifications();
      unsubscribeConfig();
    };
  }, []);

  const cleanupOldRevenueRequests = async (userId: string, currentRequestId: string) => {
    try {
      const oldRequests = revenueRequests.filter(r => 
        r.userId === userId && 
        r.id !== currentRequestId && 
        r.status !== 'pending'
      );
      
      for (const oldReq of oldRequests) {
        await deleteDoc(doc(db, 'revenue_requests', oldReq.id!));
      }
    } catch (error) {
      console.error("Error cleaning up old requests:", error);
    }
  };

  const handleApproveRevenue = async (req: RevenueRequest) => {
    try {
      await cleanupOldRevenueRequests(req.userId, req.id!);
      await updateDoc(doc(db, 'revenue_requests', req.id!), { 
        status: 'approved',
        approvalReason: `Aprovado pelo operador ${profile?.fullName || 'Admin'}`,
        approvedBy: profile?.uid
      });
      const userRef = doc(db, 'users', req.userId);
      await updateDoc(userRef, { monthlyRevenue: req.revenue });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `revenue_requests/${req.id}`);
    }
  };

  const handleRequestProof = async () => {
    if (!proofRequest) return;
    try {
      const h = parseInt(proofTime.h) || 0;
      const m = parseInt(proofTime.m) || 0;
      const s = parseInt(proofTime.s) || 0;
      const totalSeconds = (h * 3600) + (m * 60) + s;
      
      await updateDoc(doc(db, 'revenue_requests', proofRequest.id!), {
        status: 'waiting_proof',
        proofMessage: proofMessage,
        proofRequired: true,
        approvalReason: deleteField(),
        approvedBy: deleteField(),
        autoApprovalTimeOverride: totalSeconds,
        timestamp: new Date().toISOString() // Reset timer
      });
      setProofRequest(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `revenue_requests/${proofRequest.id}`);
    }
  };

  const handleRejectRevenue = async (req: RevenueRequest) => {
    try {
      await updateDoc(doc(db, 'revenue_requests', req.id!), { 
        status: 'rejected',
        approvalReason: `Recusado pelo operador ${profile?.fullName || 'Admin'}`,
        approvedBy: profile?.uid
      });
      const userRef = doc(db, 'users', req.userId);
      await updateDoc(userRef, { monthlyRevenue: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `revenue_requests/${req.id}`);
    }
  };

  useEffect(() => {
    if (!config.revenueAnalysisTime || revenueRequests.length === 0) return;
    
    const expiredRequests = revenueRequests.filter(r => {
      if (r.status !== 'pending' && r.status !== 'waiting_proof') return false;
      const startedAt = new Date(r.timestamp).getTime();
      const analysisTime = r.autoApprovalTimeOverride || config.revenueAnalysisTime!;
      const expiresAt = startedAt + (analysisTime * 1000);
      return now.getTime() >= expiresAt;
    });

    expiredRequests.forEach(async (req) => {
      try {
        await cleanupOldRevenueRequests(req.userId, req.id!);
        await updateDoc(doc(db, 'revenue_requests', req.id!), { 
          status: 'approved',
          approvalReason: 'Auto-aprovado'
        });
        const userRef = doc(db, 'users', req.userId);
        await updateDoc(userRef, { monthlyRevenue: req.revenue });
      } catch (error) {
        console.error("Auto-approval error:", error);
      }
    });
  }, [revenueRequests, config.revenueAnalysisTime, now]);

  useEffect(() => {
    const releaseTime = config.autoReleaseTime || 60;
    if (proposals.length === 0) return;
    
    const nowTime = now.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    // Auto-release logic
    const paidProposals = proposals.filter(p => {
      if (p.status !== 'paid') return false;
      const startedAt = new Date(p.updatedAt || p.createdAt).getTime();
      const expiresAt = startedAt + (releaseTime * 1000);
      return nowTime >= expiresAt;
    });

    paidProposals.forEach(async (p) => {
      try {
        await handleCompleteProposal(p);
      } catch (error) {
        console.error("Auto-release error:", error);
      }
    });

    // Auto-delete logic (older than 7 days)
    const oldProposals = proposals.filter(p => {
      const createdAt = new Date(p.createdAt).getTime();
      return (nowTime - createdAt) > sevenDays;
    });

    oldProposals.forEach(async (p) => {
      try {
        await deleteDoc(doc(db, 'proposals', p.id!));
      } catch (error) {
        console.error("Error deleting old proposal:", error);
      }
    });
  }, [proposals, config.autoReleaseTime, now]);

  const formatTimeLeft = (timestamp: string, analysisTime: number, override?: number) => {
    const finalTime = override || analysisTime;
    const startedAt = new Date(timestamp).getTime();
    const expiresAt = startedAt + (finalTime * 1000);
    const remaining = Math.max(0, expiresAt - now.getTime());
    
    if (remaining === 0) return "00:00:00";
    
    const seconds = Math.floor((remaining / 1000) % 60);
    const minutes = Math.floor((remaining / (1000 * 60)) % 60);
    const hours = Math.floor((remaining / (1000 * 60 * 60)));
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = now.getTime() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `há ${days}d`;
    if (hours > 0) return `há ${hours}h`;
    if (minutes > 0) return `há ${minutes}m`;
    return 'agora';
  };

  const handleApproveProposal = async (p: LoanProposal) => {
    try {
      await updateDoc(doc(db, 'proposals', p.id!), { status: 'approved' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `proposals/${p.id}`);
    }
  };

  const handleCompleteProposal = async (p: LoanProposal) => {
    if (!p.id || processingProposals.current.has(p.id)) return;
    processingProposals.current.add(p.id);
    try {
      await updateDoc(doc(db, 'proposals', p.id!), { status: 'completed' });
      const userRef = doc(db, 'users', p.userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data() as UserProfile;
        await updateDoc(userRef, { balance: userData.balance + p.approvedAmount });
      }
      setConfirmRelease(null);
    } catch (error) {
      processingProposals.current.delete(p.id);
      handleFirestoreError(error, OperationType.UPDATE, `proposals/${p.id}`);
    }
  };

  const handleRejectProposal = async (p: LoanProposal) => {
    try {
      await updateDoc(doc(db, 'proposals', p.id!), { status: 'rejected' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `proposals/${p.id}`);
    }
  };

  const updateConfig = async (newConfig: Partial<AppConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    try {
      await setDoc(doc(db, 'config', 'app'), updated, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'config/app');
    }
  };

  const handleTriggerRefusal = async (user: UserProfile) => {
    try {
      const proposalId = Math.random().toString(36).substring(2, 15);
      const newProposal: LoanProposal = {
        id: proposalId,
        userId: user.uid,
        userName: user.fullName,
        userEmail: user.email,
        requestedAmount: 100, // Valor padrão para teste
        installments: 1,
        status: 'refused',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        approvedAmount: 100,
        refusalReason: 'O Pix do depósito foi recusado pelo banco emissor e está em processo de estorno. O tempo para o banco compensar pode ser de até 24 horas úteis.'
      };
      
      await setDoc(doc(db, 'proposals', proposalId), newProposal);
      // Usando console.log em vez de alert por ser um ambiente de iframe
      console.log(`Notificação de recusa enviada para ${user.fullName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'proposals');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const userRef = doc(db, 'users', editingUser.uid);
      await updateDoc(userRef, { ...editingUser });
      setEditingUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.uid}`);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  const handleDeleteRevenueRequest = async (req: RevenueRequest) => {
    try {
      await deleteDoc(doc(db, 'revenue_requests', req.id!));
      const userRef = doc(db, 'users', req.userId);
      await updateDoc(userRef, { monthlyRevenue: 0 });
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `revenue_requests/${req.id}`);
    }
  };

  const handleDeleteProposal = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'proposals', id));
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `proposals/${id}`);
    }
  };

  const addBanner = () => {
    const url = prompt("URL da imagem do banner:");
    if (url) {
      updateConfig({ banners: [...config.banners, url] });
    }
  };

  const removeBanner = (index: number) => {
    const newBanners = config.banners.filter((_, i) => i !== index);
    updateConfig({ banners: newBanners });
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-zinc-200 p-6 space-y-8">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">EmpireCred Admin</h1>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">v1.6.4</p>
        </div>
        <nav className="space-y-2">
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<TrendingUp size={18}/>} label="Dashboard" />
          <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings size={18}/>} label="Configurações" />
          <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users size={18}/>} label="Usuários" />
          <TabButton active={activeTab === 'proposals'} onClick={() => setActiveTab('proposals')} icon={<FileText size={18}/>} label="Propostas" />
          <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={<FileText size={18}/>} label="Documentos" />
          <TabButton active={activeTab === 'verifications'} onClick={() => setActiveTab('verifications')} icon={<Shield size={18}/>} label="Biometria" />
          
          <div className="pt-8 mt-8 border-t border-zinc-100">
            <button 
              onClick={() => navigate('/dashboard')}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold text-zinc-400 hover:bg-zinc-50 transition-all"
            >
              <ArrowLeft size={18} />
              <span>Voltar ao App</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-zinc-900">Relatório Inteligente</h2>
                <p className="text-xs text-zinc-400 font-medium">Acompanhe o desempenho da sua plataforma em tempo real.</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-zinc-900 px-4 py-2 rounded-2xl border border-zinc-800 shadow-sm">
                  <TrendingUp size={14} className="text-emerald-400" />
                  <select 
                    value={globalRange}
                    onChange={(e) => handleGlobalRangeChange(e.target.value as TimeRange)}
                    className="text-[10px] font-bold text-white bg-transparent outline-none cursor-pointer"
                  >
                    <option value="today" className="text-zinc-900">Hoje (Global)</option>
                    <option value="yesterday" className="text-zinc-900">Ontem (Global)</option>
                    <option value="before_yesterday" className="text-zinc-900">Ontem de Ontem (Global)</option>
                    <option value="7d" className="text-zinc-900">7 Dias (Global)</option>
                    <option value="all" className="text-zinc-900">Todo Tempo (Global)</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-2xl border border-zinc-100 shadow-sm">
                  <Clock size={14} className="text-zinc-400" />
                  <select 
                    value={onlineInterval}
                    onChange={(e) => setOnlineInterval(Number(e.target.value))}
                    className="text-[10px] font-bold text-zinc-600 bg-transparent outline-none cursor-pointer"
                  >
                    <option value={1}>Tempo Real (1m)</option>
                    <option value={5}>Últimos 5 min</option>
                    <option value={10}>Últimos 10 min</option>
                    <option value={30}>Últimos 30 min</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Live</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard 
                title="Usuários Online" 
                value={getStats().onlineUsers.toString()} 
                icon={<Activity className="text-emerald-500" size={20} />}
                trend="Ativos agora"
                range={null}
              />
              <StatCard 
                title="Novos Usuários" 
                value={getStats(cardRanges.users).totalUsers.toString()} 
                icon={<Users className="text-blue-500" size={20} />}
                trend={cardRanges.users === 'today' ? `${getStats().usersYesterday} ontem` : 'Crescimento'}
                range={cardRanges.users}
                onRangeChange={(r) => setCardRanges({...cardRanges, users: r})}
              />
              <StatCard 
                title="Propostas" 
                value={getStats(cardRanges.proposals).totalProposals.toString()} 
                icon={<FileText className="text-amber-500" size={20} />}
                trend={`${getStats(cardRanges.proposals).pendingProposals} pendentes`}
                range={cardRanges.proposals}
                onRangeChange={(r) => setCardRanges({...cardRanges, proposals: r})}
              />
              <StatCard 
                title="Taxa de Aprovação" 
                value={`${getStats(cardRanges.approval).approvalRate.toFixed(1)}%`} 
                icon={<Check className="text-emerald-500" size={20} />}
                trend="Média do período"
                range={cardRanges.approval}
                onRangeChange={(r) => setCardRanges({...cardRanges, approval: r})}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg">Taxas de Aprovação</h3>
                    <p className="text-xs text-zinc-400">Total arrecadado em taxas de antecipação no período selecionado.</p>
                  </div>
                  <select 
                    value={cardRanges.revenue}
                    onChange={(e) => setCardRanges({...cardRanges, revenue: e.target.value as TimeRange})}
                    className="text-[10px] font-bold text-zinc-600 bg-zinc-50 px-3 py-2 rounded-xl outline-none border border-zinc-100"
                  >
                    <option value="today">Hoje</option>
                    <option value="yesterday">Ontem</option>
                    <option value="before_yesterday">Ontem de Ontem</option>
                    <option value="7d">7 Dias</option>
                    <option value="all">Todo Tempo</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-6 bg-emerald-50 rounded-3xl space-y-2 border border-emerald-100 relative group">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Total em Taxas</p>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => setHideFees(!hideFees)}
                          className="p-1 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-600"
                        >
                          {hideFees ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <TrendingUp size={14} className="text-emerald-400" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-emerald-900">
                      {hideFees ? 'R$ ••••••' : `R$ ${(getStats(cardRanges.revenue).totalFeesPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div className="p-6 bg-blue-50 rounded-3xl space-y-2 border border-blue-100">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Média por Taxa</p>
                      <BarChart3 size={14} className="text-blue-400" />
                    </div>
                    <p className="text-2xl font-bold text-blue-900">R$ {(getStats(cardRanges.revenue).avgFee || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <button 
                    onClick={() => setShowConversionLogic(true)}
                    className="p-6 bg-zinc-900 rounded-3xl space-y-2 text-white text-left hover:scale-[1.02] transition-transform"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CONVERSÃO</p>
                        <p className="text-[8px] font-bold text-zinc-500 lowercase opacity-60">initiateCheckout/newAccount</p>
                      </div>
                      <ArrowUpRight size={14} className="text-emerald-400" />
                    </div>
                    <p className="text-2xl font-bold">{(getStats(cardRanges.revenue).totalProposals / (getStats(cardRanges.revenue).totalUsers || 1) * 100).toFixed(1)}%</p>
                  </button>
                </div>
                
                <div className="pt-8 border-t border-zinc-100">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-sm font-bold text-zinc-900">Distribuição de Propostas</h4>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Aprovadas</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Pendentes</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="w-full h-4 bg-zinc-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(getStats(cardRanges.revenue).approvedProposals / ((getStats(cardRanges.revenue).approvedProposals + getStats(cardRanges.revenue).pendingProposals) || 1)) * 100}%` }} />
                    <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${(getStats(cardRanges.revenue).pendingProposals / ((getStats(cardRanges.revenue).approvedProposals + getStats(cardRanges.revenue).pendingProposals) || 1)) * 100}%` }} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4 text-center">
                    <p className="text-xs font-bold text-emerald-600">{getStats(cardRanges.revenue).approvedProposals} Aprovadas</p>
                    <p className="text-xs font-bold text-amber-600">{getStats(cardRanges.revenue).pendingProposals} Pendentes</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-zinc-900 p-8 rounded-[32px] text-white space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">Atividade Recente</h3>
                    <Activity size={18} className="text-emerald-400" />
                  </div>
                  <div className="space-y-4">
                    {proposals.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {p.status === 'approved' ? <Check size={14} /> : <Clock size={14} />}
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-2">
                              <p className="text-[10px] font-bold truncate w-24">{users.find(u => u.uid === p.userId)?.fullName || 'Usuário'}</p>
                              <span className="text-[8px] text-zinc-500 font-medium">{getTimeAgo(p.updatedAt || p.createdAt)}</span>
                            </div>
                            <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">{p.status}</p>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold">R$ {(p.approvedAmount || 0).toLocaleString('pt-BR')}</p>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setActiveTab('proposals')}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Ver Todas as Propostas
                  </button>
                </div>

                <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-blue-50 rounded-2xl">
                      <PieChart className="text-blue-500" size={20} />
                    </div>
                    <h3 className="font-bold text-sm">Resumo da Base</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Total de Usuários</span>
                      <span className="text-sm font-bold">{users.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Propostas Enviadas</span>
                      <span className="text-sm font-bold">{proposals.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Biometrias Realizadas</span>
                      <span className="text-sm font-bold">{verifications.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && config && (
          <div className="max-w-2xl space-y-8">
            <section className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-6">
              <h2 className="font-bold text-lg">Geral</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">Verificação Facial</p>
                  <p className="text-xs text-zinc-500">Exigir biometria antes da simulação</p>
                </div>
                <button 
                  onClick={() => updateConfig({ facialVerificationEnabled: !config.facialVerificationEnabled })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.facialVerificationEnabled ? 'bg-emerald-500' : 'bg-zinc-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.facialVerificationEnabled ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-sm">Banner de Crédito (URL)</p>
                <input 
                  type="text" 
                  value={config.creditBannerUrl}
                  onChange={e => updateConfig({ creditBannerUrl: e.target.value })}
                  className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-xs outline-none"
                />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-sm">Tempo de Análise de Renda (segundos)</p>
                <input 
                  type="number" 
                  value={config.revenueAnalysisTime || 60}
                  onChange={e => updateConfig({ revenueAnalysisTime: parseInt(e.target.value) || 0 })}
                  className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-xs outline-none"
                />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-sm">Tempo para Liberação de Crédito (segundos)</p>
                <input 
                  type="number" 
                  value={config.autoReleaseTime || 60}
                  onChange={e => updateConfig({ autoReleaseTime: parseInt(e.target.value) || 0 })}
                  className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-xs outline-none"
                />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-sm">Taxa da Plataforma (R$)</p>
                <input 
                  type="number" 
                  step="0.01"
                  value={config.platformFee || 29.90}
                  onChange={e => updateConfig({ platformFee: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-xs outline-none"
                />
              </div>
            </section>

            <section className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg">Banners Home</h2>
                <button onClick={addBanner} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg transition-colors">
                  <Plus size={20} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {config.banners.map((url, i) => (
                  <div key={i} className="flex items-center space-x-4 p-3 bg-zinc-50 rounded-2xl group">
                    <img src={url} alt="" className="w-16 h-10 object-cover rounded-lg" />
                    <p className="text-[10px] text-zinc-400 truncate flex-1">{url}</p>
                    <button onClick={() => removeBanner(i)} className="text-zinc-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-400 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-6 py-4">Nome</th>
                    <th className="px-6 py-4">CPF</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Saldo</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {users.map((u, i) => (
                    <tr key={i} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 font-bold">{u.fullName}</td>
                      <td className="px-6 py-4 font-mono">{u.cpf}</td>
                      <td className="px-6 py-4">{u.email}</td>
                      <td className="px-6 py-4 font-bold text-emerald-600">R$ {(u.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button 
                          onClick={() => handleTriggerRefusal(u)} 
                          className="text-zinc-400 hover:text-red-500"
                          title="Simular Depósito Recusado"
                        >
                          <AlertCircle size={16} />
                        </button>
                        <button onClick={() => setEditingUser(u)} className="text-zinc-400 hover:text-zinc-900">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => setConfirmDelete({ type: 'user', id: u.uid })} className="text-zinc-300 hover:text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

      {editingUser && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-white w-full max-w-2xl rounded-3xl p-8 space-y-6 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">Editar Usuário</h3>
                    <button onClick={() => setEditingUser(null)}><CloseIcon size={24}/></button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <AdminInput label="Nome Completo" value={editingUser.fullName} onChange={v => setEditingUser({...editingUser, fullName: v})} />
                    <AdminInput label="CPF" value={editingUser.cpf} onChange={v => setEditingUser({...editingUser, cpf: v})} />
                    <AdminInput label="Saldo (R$)" type="number" value={editingUser.balance.toString()} onChange={v => setEditingUser({...editingUser, balance: parseFloat(v)})} />
                    <AdminInput label="Email" value={editingUser.email} onChange={v => setEditingUser({...editingUser, email: v})} />
                    <AdminInput label="Telefone" value={editingUser.phone} onChange={v => setEditingUser({...editingUser, phone: v})} />
                    <AdminInput label="Data Nasc." type="date" value={editingUser.birthDate} onChange={v => setEditingUser({...editingUser, birthDate: v})} />
                    <AdminInput label="Nome da Mãe" value={editingUser.motherName} onChange={v => setEditingUser({...editingUser, motherName: v})} />
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase">Role</label>
                      <select 
                        value={editingUser.role} 
                        onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                        className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-xs outline-none"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={handleUpdateUser}
                    className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2"
                  >
                    <Save size={20} />
                    <span>Salvar Alterações</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'proposals' && (
          <div className="space-y-8">
            <div className="flex items-center space-x-4 border-b border-zinc-200 pb-4">
              <button 
                onClick={() => setProposalFilter('pending')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${proposalFilter === 'pending' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
              >
                Pendentes
              </button>
              <button 
                onClick={() => setProposalFilter('waiting_proof')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${proposalFilter === 'waiting_proof' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
              >
                Aguardando documento
              </button>
              <button 
                onClick={() => setProposalFilter('approved')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${proposalFilter === 'approved' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
              >
                Limites Aprovados
              </button>
              <button 
                onClick={() => setProposalFilter('rejected')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${proposalFilter === 'rejected' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
              >
                Limites Recusados
              </button>
              <button 
                onClick={() => setProposalFilter('paid')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${proposalFilter === 'paid' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
              >
                Pagos
              </button>
              <button 
                onClick={() => setProposalFilter('completed')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${proposalFilter === 'completed' ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-100'}`}
              >
                Finalizados
              </button>
            </div>

            <div className="grid grid-cols-1 gap-8">
              {/* Revenue Requests Section */}
              <section className="space-y-4">
                <h2 className="font-bold text-lg flex items-center space-x-2">
                  <TrendingUp size={20} className="text-emerald-600" />
                  <span>Requerimentos de Faturamento</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {revenueRequests
                    .filter(r => r.status === proposalFilter)
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map((r, i) => (
                      <div key={i} className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : r.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                            {r.status}
                          </span>
                          <p className="text-[10px] text-zinc-400">{new Date(r.timestamp).toLocaleDateString()}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold truncate">{r.userName}</p>
                          <p className="text-[10px] text-zinc-400 font-mono">{r.userEmail}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-zinc-500 uppercase font-bold">Faturamento Declarado</p>
                          <p className="text-xl font-bold text-emerald-600">R$ {(r.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        
                        {(r.status === 'pending' || r.status === 'waiting_proof') && config.revenueAnalysisTime && (
                          <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">Auto-aprovação em:</span>
                            <span className="text-sm font-mono font-bold text-zinc-900">{formatTimeLeft(r.timestamp, config.revenueAnalysisTime, r.autoApprovalTimeOverride)}</span>
                          </div>
                        )}

                        {r.approvalReason && (
                          <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Motivo:</p>
                            <p className="text-xs text-zinc-600 font-medium">{r.approvalReason}</p>
                          </div>
                        )}

                        {((r.proofUrls && r.proofUrls.length > 0) || r.proofUrl) && (
                          <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 space-y-2">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Comprovantes enviados:</p>
                            <div className="flex flex-wrap gap-2">
                              {r.proofUrls && r.proofUrls.length > 0 ? (
                                r.proofUrls.map((url, idx) => (
                                  <a 
                                    key={idx}
                                    href={url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-emerald-700 font-bold underline flex items-center space-x-1 bg-white px-2 py-1 rounded-lg border border-emerald-100 shadow-sm"
                                  >
                                    <Download size={12} />
                                    <span>Ver Documento {idx + 1}</span>
                                  </a>
                                ))
                              ) : (
                                <a 
                                  href={r.proofUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-xs text-emerald-700 font-bold underline flex items-center space-x-1 bg-white px-2 py-1 rounded-lg border border-emerald-100 shadow-sm"
                                >
                                  <Download size={12} />
                                  <span>Ver Documento</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {r.status === 'pending' ? (
                          <div className="flex flex-col space-y-2 pt-2">
                            <div className="flex items-center space-x-2">
                              <button 
                                onClick={() => handleApproveRevenue(r)}
                                className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                              >
                                <Check size={14} />
                                <span>Aceitar</span>
                              </button>
                              <button 
                                onClick={() => handleRejectRevenue(r)}
                                className="flex-1 bg-red-500 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                              >
                                <X size={14} />
                                <span>Recusar</span>
                              </button>
                            </div>
                            <button 
                              onClick={() => setProofRequest(r)}
                              className="w-full bg-amber-500 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                            >
                              <FileText size={14} />
                              <span>Exigir Comprovante</span>
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setConfirmDelete({ type: 'revenue', id: r.id!, data: r })}
                            className="w-full bg-zinc-50 text-zinc-400 py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                            <span>Excluir</span>
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </section>

              {/* Loan Proposals Section */}
              <section className="space-y-4">
                <h2 className="font-bold text-lg flex items-center space-x-2">
                  <FileText size={20} className="text-blue-600" />
                  <span>Propostas de Crédito</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {proposals
                    .filter(p => {
                      if (proposalFilter === 'paid') return p.status === 'paid' || p.status === 'completed';
                      return p.status === proposalFilter;
                    })
                    .map((p, i) => (
                      <div key={i} className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                            p.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 
                            p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                            p.status === 'completed' ? 'bg-blue-50 text-blue-600' :
                            p.status === 'rejected' ? 'bg-red-50 text-red-600' : 
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {p.status === 'paid' ? 'Pago' : p.status === 'completed' ? 'Finalizado' : p.status}
                          </span>
                          <p className="text-[10px] text-zinc-400">{new Date(p.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold truncate">{users.find(u => u.uid === p.userId)?.fullName || 'Usuário'}</p>
                          <p className="text-[10px] text-zinc-400 font-mono">{users.find(u => u.uid === p.userId)?.email || p.userId}</p>
                        </div>
                        
                        {p.status === 'paid' ? (
                          <div className="space-y-3">
                            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center space-y-1">
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Valor Pago (Taxa)</p>
                              <p className="text-2xl font-bold text-emerald-900">R$ {(config.platformFee || 29.90).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p className="text-[10px] text-emerald-600 mt-1">Valor Solicitado: R$ {(p.approvedAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <button 
                              onClick={() => setConfirmRelease(p)}
                              className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-100"
                            >
                              <TrendingUp size={16} />
                              <span>Liberar Saldo</span>
                            </button>
                          </div>
                        ) : p.status === 'completed' ? (
                          <div className="space-y-3">
                            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center space-y-1">
                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Status do Saldo</p>
                              <p className="text-xl font-bold text-blue-900">Saldo Liberado</p>
                              <p className="text-[10px] text-blue-600 mt-1">Valor: R$ {(p.approvedAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            {proposalFilter === 'paid' && (
                              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100 text-center">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase">Observação</p>
                                <p className="text-[10px] text-zinc-500">O saldo já foi liberado para este usuário.</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs text-zinc-500 uppercase font-bold">Valor Solicitado</p>
                            <p className="text-xl font-bold">R$ {(p.approvedAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-[10px]">
                          <div>
                            <p className="text-zinc-400">Parcelas</p>
                            <p className="font-bold">{p.installments}x</p>
                          </div>
                          <div>
                            <p className="text-zinc-400">Taxa</p>
                            <p className="font-bold">{p.interestRate}% a.m.</p>
                          </div>
                        </div>
                        {p.status === 'pending' ? (
                          <div className="flex items-center space-x-2 pt-2">
                            <button 
                              onClick={() => handleApproveProposal(p)}
                              className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                            >
                              <Check size={14} />
                              <span>Aprovar</span>
                            </button>
                            <button 
                              onClick={() => handleRejectProposal(p)}
                              className="flex-1 bg-red-500 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                            >
                              <X size={14} />
                              <span>Recusar</span>
                            </button>
                          </div>
                        ) : p.status !== 'paid' && (
                          <button 
                            onClick={() => setConfirmDelete({ type: 'proposal', id: p.id! })}
                            className="w-full bg-zinc-50 text-zinc-400 py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                            <span>Excluir</span>
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Documentos de Faturamento</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {revenueRequests
                .filter(r => (r.proofUrls && r.proofUrls.length > 0) || r.proofUrl)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((r, i) => (
                  <div key={i} className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : r.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        {r.status}
                      </span>
                      <p className="text-[10px] text-zinc-400">{new Date(r.timestamp).toLocaleDateString()}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold truncate">{r.userName}</p>
                      <p className="text-[10px] text-zinc-400 font-mono">{r.userEmail}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500 uppercase font-bold">Faturamento Declarado</p>
                      <p className="text-xl font-bold text-emerald-600">R$ {(r.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    
                    <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 space-y-2">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Comprovantes:</p>
                      <div className="flex flex-col gap-2">
                        {r.proofUrls && r.proofUrls.length > 0 ? (
                          r.proofUrls.map((url, idx) => (
                            <a 
                              key={idx}
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-emerald-700 font-bold underline flex items-center space-x-1 bg-white px-2 py-1 rounded-lg border border-emerald-100 shadow-sm"
                            >
                              <Download size={12} />
                              <span>Ver Documento {idx + 1}</span>
                            </a>
                          ))
                        ) : (
                          <a 
                            href={r.proofUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-700 font-bold underline flex items-center space-x-1 bg-white px-2 py-1 rounded-lg border border-emerald-100 shadow-sm"
                          >
                            <Download size={12} />
                            <span>Ver Documento</span>
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                      <button 
                        onClick={() => handleApproveRevenue(r)}
                        className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                      >
                        <Check size={14} />
                        <span>Aprovar</span>
                      </button>
                      <button 
                        onClick={() => handleRejectRevenue(r)}
                        className="flex-1 bg-red-500 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                      >
                        <X size={14} />
                        <span>Recusar</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} className="text-red-500" />
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold">Confirmar Exclusão</h3>
                <p className="text-sm text-zinc-500">
                  {confirmDelete.type === 'revenue' 
                    ? "Excluir este requerimento? Isso também resetará a renda do usuário para R$ 0,00."
                    : confirmDelete.type === 'user'
                    ? "Tem certeza que deseja excluir este usuário? Esta ação é irreversível."
                    : "Tem certeza que deseja excluir esta proposta?"}
                </p>
              </div>

              <div className="flex flex-col space-y-3">
                <button 
                  onClick={() => {
                    if (confirmDelete.type === 'revenue') handleDeleteRevenueRequest(confirmDelete.data);
                    else if (confirmDelete.type === 'user') handleDeleteUser(confirmDelete.id);
                    else handleDeleteProposal(confirmDelete.id);
                  }}
                  className="w-full bg-red-500 text-white py-4 rounded-2xl font-bold text-sm hover:bg-red-600 transition-colors"
                >
                  Sim, Excluir
                </button>
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold text-sm hover:bg-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeTab === 'verifications' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Registros de Biometria Facial</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {verifications
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((v, i) => (
                  <div key={i} className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
                    <video src={v.videoUrl} controls className="w-full aspect-video rounded-2xl bg-zinc-900" />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase">
                          {v.status}
                        </span>
                        <p className="text-[10px] text-zinc-400">{new Date(v.timestamp).toLocaleString()}</p>
                      </div>
                      
                      <div className="space-y-1">
                        <p className="text-sm font-bold">{v.userName || 'Usuário Desconhecido'}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">CPF: {v.userCpf || 'N/A'}</p>
                      </div>

                      <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                        <p className="text-[8px] font-bold text-zinc-400 uppercase mb-1">Caminho do Arquivo:</p>
                        <p className="text-[10px] text-zinc-500 font-mono break-all">{v.videoUrl}</p>
                      </div>

                      <div className="flex items-center space-x-2 pt-2">
                        <a 
                          href={v.videoUrl} 
                          download={`video-${v.userCpf || v.id}.mp4`}
                          className="flex-1 bg-zinc-900 text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1"
                        >
                          <Download size={14} />
                          <span>Baixar Vídeo</span>
                        </a>
                        <button 
                          onClick={async () => {
                            if (confirm('Tem certeza que deseja excluir este registro?')) {
                              await deleteDoc(doc(db, 'verifications', v.id!));
                            }
                          }}
                          className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            {verifications.length === 0 && (
              <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-zinc-200">
                <Shield size={48} className="mx-auto text-zinc-200 mb-4" />
                <p className="text-zinc-400 font-medium">Nenhum registro de biometria encontrado.</p>
              </div>
            )}
          </div>
        )}

        {/* Release Confirmation Modal */}
        <AnimatePresence>
          {confirmRelease && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-md rounded-[32px] p-8 space-y-6 shadow-2xl"
              >
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-[#008542]">
                    <TrendingUp size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-zinc-900">Liberar Saldo</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      Deseja liberar o saldo de <span className="font-bold text-zinc-900">R$ {(confirmRelease.approvedAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> para o usuário? O valor será adicionado instantaneamente ao saldo da conta.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col space-y-3">
                  <button 
                    onClick={() => handleCompleteProposal(confirmRelease)}
                    className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-sm hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-100"
                  >
                    Confirmar e Liberar
                  </button>
                  <button 
                    onClick={() => setConfirmRelease(null)}
                    className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold text-sm hover:bg-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Proof Request Modal */}
        <AnimatePresence>
          {proofRequest && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl"
              >
                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-zinc-900">Exigir Comprovante</h3>
                    <button onClick={() => setProofRequest(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                      <CloseIcon size={20} className="text-zinc-400" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Tempo para Auto-aprovação</label>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <span className="text-[8px] text-zinc-400 uppercase font-bold ml-1">HH</span>
                          <input 
                            type="text" 
                            maxLength={2}
                            value={proofTime.h}
                            onChange={e => setProofTime({...proofTime, h: e.target.value.replace(/\D/g, '')})}
                            className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-center font-mono font-bold outline-none focus:ring-2 focus:ring-zinc-200"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] text-zinc-400 uppercase font-bold ml-1">MM</span>
                          <input 
                            type="text" 
                            maxLength={2}
                            value={proofTime.m}
                            onChange={e => setProofTime({...proofTime, m: e.target.value.replace(/\D/g, '')})}
                            className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-center font-mono font-bold outline-none focus:ring-2 focus:ring-zinc-200"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] text-zinc-400 uppercase font-bold ml-1">SS</span>
                          <input 
                            type="text" 
                            maxLength={2}
                            value={proofTime.s}
                            onChange={e => setProofTime({...proofTime, s: e.target.value.replace(/\D/g, '')})}
                            className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-center font-mono font-bold outline-none focus:ring-2 focus:ring-zinc-200"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Mensagem para o Cliente</label>
                      <textarea 
                        value={proofMessage}
                        onChange={e => setProofMessage(e.target.value)}
                        className="w-full bg-zinc-50 border-none rounded-2xl py-4 px-5 text-sm font-medium outline-none focus:ring-2 focus:ring-zinc-200 min-h-[100px] resize-none"
                        placeholder="Ex: Envie pelo menos um documento para comprovar seu faturamento."
                      />
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button 
                      onClick={() => setProofRequest(null)}
                      className="flex-1 py-4 rounded-2xl font-bold text-zinc-500 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleRequestProof}
                      className="flex-1 py-4 rounded-2xl font-bold text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
                    >
                      Solicitar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
          
          {showConversionLogic && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" 
              onClick={() => setShowConversionLogic(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white p-8 rounded-[32px] max-w-sm w-full space-y-6 shadow-2xl" 
                onClick={e => e.stopPropagation()}
              >
                <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-emerald-400">
                  <TrendingUp size={24} />
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-xl text-zinc-900">Lógica de Conversão</h4>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    A conversão é calculada dividindo o <strong>total de usuários únicos com propostas</strong> pelo <strong>total de usuários cadastrados</strong> no período selecionado.
                  </p>
                </div>
                <button 
                  onClick={() => setShowConversionLogic(false)}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-colors"
                >
                  Entendi
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon, 
  trend, 
  range, 
  onRangeChange 
}: { 
  title: string, 
  value: string, 
  icon: React.ReactNode, 
  trend: string,
  range: 'today' | 'yesterday' | 'before_yesterday' | '7d' | 'all' | null,
  onRangeChange?: (r: 'today' | 'yesterday' | 'before_yesterday' | '7d' | 'all') => void
}) {
  return (
    <div className="bg-white p-6 rounded-[28px] border border-zinc-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="p-3 bg-zinc-50 rounded-2xl">
          {icon}
        </div>
        {range !== null && onRangeChange ? (
          <select 
            value={range}
            onChange={(e) => onRangeChange(e.target.value as any)}
            className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-50 px-2 py-1 rounded-lg outline-none border border-zinc-100"
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="before_yesterday">Ontem de Ontem</option>
            <option value="7d">7 Dias</option>
            <option value="all">Tudo</option>
          </select>
        ) : (
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{trend}</span>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{title}</p>
        <p className="text-3xl font-bold text-zinc-900">{value}</p>
        {range !== null && (
          <p className="text-[10px] text-zinc-400 font-medium mt-1 ml-1">{trend}</p>
        )}
      </div>
    </div>
  );
}

function AdminInput({ label, value, onChange, type = 'text' }: { label: string, value: string, onChange: (v: string) => void, type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="w-full bg-zinc-50 border-none rounded-xl py-3 px-4 text-xs outline-none focus:ring-2 focus:ring-zinc-200 transition-all"
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${active ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-200' : 'text-zinc-400 hover:bg-zinc-50'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
