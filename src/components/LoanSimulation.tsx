import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, TrendingUp, AlertCircle, X, ChevronRight, FileText, Sparkles, Play, Info, Check, Edit2, Download, QrCode, Receipt, Copy, Camera } from 'lucide-react';
import { doc, updateDoc, onSnapshot, collection, addDoc, query, where, getDocs, deleteField, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, AppConfig, RevenueRequest, LoanProposal } from '../types';
import { sigiloPayService, SigiloPayResponse } from '../services/sigiloPayService';

function LoanSimulation({ profile, setProfile }: { profile: UserProfile | null, setProfile: (p: UserProfile) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const type = location.state?.type || 'personal';

  const [step, setStep] = useState(1);
  const [revenue, setRevenue] = useState(() => {
    const val = profile?.monthlyRevenue || Number(localStorage.getItem('empirecred_revenue')) || Number(location.state?.revenue) || 0;
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  const [isEditingRevenue, setIsEditingRevenue] = useState(false);
  const [revenueStatus, setRevenueStatus] = useState<'approved' | 'analyzing' | 'rejected' | 'waiting_proof' | 'idle'>('idle');
  const [analysisTimeLeft, setAnalysisTimeLeft] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [isInitialProcessing, setIsInitialProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState('Procurando ofertas...');
  const [revenueRequest, setRevenueRequest] = useState<RevenueRequest | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isEditingProof, setIsEditingProof] = useState(false);
  const [proposals, setProposals] = useState<LoanProposal[]>([]);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [showStories, setShowStories] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [activeStorySet, setActiveStorySet] = useState<'financas' | 'dicas' | null>(null);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'proposals'), where('userId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date().getTime();
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as LoanProposal))
        .filter(p => {
          const createdAt = new Date(p.createdAt).getTime();
          return (now - createdAt) <= (24 * 60 * 60 * 1000); // 24 hours
        });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setProposals(list);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('success') === 'true') {
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 8000);
    }
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const storyParam = params.get('story');
    if (storyParam === 'dicas') {
      setActiveStorySet('dicas');
      setShowStories(true);
      setCurrentStoryIndex(0);
    } else if (storyParam === 'financas') {
      setActiveStorySet('financas');
      setShowStories(true);
      setCurrentStoryIndex(0);
    }
  }, [location.search]);

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !revenueRequest || !profile) return;

    setIsUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append('proof', file);
      formData.append('cpf', profile.cpf); // Envia o CPF para o nome do arquivo

      const response = await fetch('/api/upload-proof', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Falha no upload');

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response received:', text.substring(0, 100));
        throw new Error('O servidor retornou uma resposta inválida (não JSON). Verifique se o servidor está rodando corretamente.');
      }

      const data = await response.json();
      
      const currentUrls = revenueRequest.proofUrls || (revenueRequest.proofUrl ? [revenueRequest.proofUrl] : []);
      const newUrls = [...currentUrls, data.proofUrl];

      await updateDoc(doc(db, 'revenue_requests', revenueRequest.id!), {
        proofUrls: newUrls,
        proofUrl: data.proofUrl, // Keep for compatibility
        status: 'pending', // Move back to pending for admin to review
        timestamp: new Date().toISOString(), // Reset timer for admin
        autoApprovalTimeOverride: null // Clear override to follow global config
      });
      
      setUploadSuccess(true);
      setIsEditingProof(false);
      setTimeout(() => setUploadSuccess(false), 5000);
    } catch (error) {
      console.error("Error uploading proof:", error);
      // Don't use alert, maybe show a temporary error state if needed
    } finally {
      setIsUploadingProof(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'revenue_requests'), where('userId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Get the most recent request
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RevenueRequest));
        docs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const req = docs[0];
        setRevenueRequest(req);
        if (req.status === 'approved') {
          setRevenueStatus('approved');
        } else if (req.status === 'pending') {
          setRevenueStatus('analyzing');
        } else if (req.status === 'rejected') {
          setRevenueStatus('rejected');
        } else if (req.status === 'waiting_proof') {
          setRevenueStatus('waiting_proof');
        } else {
          setRevenueStatus('idle');
        }
      }
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  const [config, setConfig] = useState<AppConfig>({
    facialVerificationEnabled: true,
    banners: [],
    creditBannerUrl: 'https://images.unsplash.com/photo-1556742049-02e49f9d4b10?q=80&w=2070&auto=format&fit=crop',
    revenueAnalysisTime: 60,
    scoreIconUrl: 'https://imgur.com/KrCDCFI.png',
    storyLogo: 'https://imgur.com/tOniE14.png',
    storyImages: [
      'https://i.imgur.com/yd0uIdV.png',
      'https://i.imgur.com/tQ1w1zj.png',
      'https://i.imgur.com/LzWNOTq.png',
      'https://i.imgur.com/LuwVEJb.png'
    ]
  });

  const storySets = {
    financas: [
      'https://imgur.com/yd0uIdV.png',
      'https://imgur.com/tQ1w1zj.png',
      'https://imgur.com/LzWNOTq.png'
    ],
    dicas: [
      'https://imgur.com/TkygaL2.png',
      'https://imgur.com/BK6OTdz.png',
      'https://imgur.com/ho9oJJn.png'
    ]
  };

  const stories = activeStorySet ? storySets[activeStorySet] : [];

  useEffect(() => {
    let timer: any;
    if (showStories) {
      timer = setInterval(() => {
        setCurrentStoryIndex(prev => {
          if (prev >= stories.length - 1) {
            setShowStories(false);
            return 0;
          }
          return prev + 1;
        });
      }, 5000);
    }
    return () => clearInterval(timer);
  }, [showStories, stories.length]);

  const [showScore, setShowScore] = useState(false);

  useEffect(() => {
    const syncConfig = async () => {
      if (!config) return;
      
      const updates: any = {};
      if (!config.scoreIconUrl) updates.scoreIconUrl = 'https://imgur.com/KrCDCFI.png';
      if (!config.storyLogo) updates.storyLogo = 'https://imgur.com/tOniE14.png';
      if (!config.storyImages || config.storyImages.length === 0) {
        updates.storyImages = [
          'https://i.imgur.com/yd0uIdV.png',
          'https://i.imgur.com/tQ1w1zj.png',
          'https://i.imgur.com/LzWNOTq.png',
          'https://i.imgur.com/LuwVEJb.png'
        ];
      }

      if (Object.keys(updates).length > 0) {
        try {
          await updateDoc(doc(db, 'config', 'app'), updates);
        } catch (err) {
          console.error("Error updating config in DB:", err);
        }
      }
    };
    syncConfig();
  }, [config]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'app'), (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as AppConfig);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/app');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (profile && config && !revenueRequest) {
      const rev = profile.monthlyRevenue || 0;
      if (rev > 0) {
        setIsEditingRevenue(false);
        if (profile.revenueAnalysisStartedAt) {
          const startedAt = new Date(profile.revenueAnalysisStartedAt).getTime();
          const now = new Date().getTime();
          const elapsed = Math.floor((now - startedAt) / 1000);
          const totalTime = config.revenueAnalysisTime || 60;
          const remaining = totalTime - elapsed;

          if (remaining > 0) {
            setRevenueStatus('analyzing');
            setAnalysisTimeLeft(remaining);
          } else {
            setRevenueStatus('approved');
            setAnalysisTimeLeft(0);
          }
        } else {
          setRevenueStatus('approved');
        }
      } else {
        setIsEditingRevenue(true);
        setRevenueStatus('idle');
      }
    } else if (revenueRequest) {
      // If we have a request, the listener useEffect already handles revenueStatus
      setIsEditingRevenue(revenueRequest.revenue === 0 || revenueRequest.status === 'rejected');
    }
  }, [profile?.uid, profile?.monthlyRevenue, profile?.revenueAnalysisStartedAt, config.revenueAnalysisTime, revenueRequest]);

  useEffect(() => {
    if (profile?.monthlyRevenue !== undefined) {
      const val = profile.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setRevenue(val);
      setIsEditingRevenue(profile.monthlyRevenue === 0);
    }
  }, [profile]);

  const parseCurrency = (val: string | number) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Remove tudo que não é dígito ou vírgula, depois troca vírgula por ponto
    const clean = val.toString().replace(/[^\d,]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  const saveRevenueToDb = async (val: string) => {
    if (!profile) return;
    setIsInitialProcessing(true);
    setRevenueStatus('idle');
    setTimeout(async () => {
      setIsInitialProcessing(false);
      const startedAt = new Date().toISOString();
      setRevenueStatus('analyzing');
      setAnalysisTimeLeft(config.revenueAnalysisTime || 60);
      try {
        const userRef = doc(db, 'users', profile.uid);
        const numericValue = parseCurrency(val);
        
        await updateDoc(userRef, { 
          monthlyRevenue: numericValue,
          revenueAnalysisStartedAt: startedAt
        });
        
        // Check if there's a pending request to update
        if (revenueRequest && revenueRequest.status === 'pending') {
          await updateDoc(doc(db, 'revenue_requests', revenueRequest.id!), {
            revenue: numericValue,
            timestamp: startedAt,
            approvalReason: deleteField(),
            approvedBy: deleteField()
          });
        } else {
          // Create Revenue Request for Admin approval
          await addDoc(collection(db, 'revenue_requests'), {
            userId: profile.uid,
            userEmail: profile.email,
            userName: profile.fullName,
            revenue: numericValue,
            status: 'pending',
            timestamp: startedAt
          });
        }

        localStorage.setItem('empirecred_revenue', numericValue.toString());
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
      }
    }, 4000);
  };

  useEffect(() => {
    let timer: any;
    if (revenueStatus === 'analyzing' && analysisTimeLeft > 0) {
      timer = setInterval(() => {
        setAnalysisTimeLeft(prev => {
          if (prev <= 1) {
            setRevenueStatus('approved');
            // Update the request in Firestore if it exists and is still pending
            if (revenueRequest && revenueRequest.id && revenueRequest.status === 'pending') {
              updateDoc(doc(db, 'revenue_requests', revenueRequest.id), {
                status: 'approved',
                approvalReason: 'Auto-aprovado'
              }).catch(err => console.error("Auto-approval sync error:", err));
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [revenueStatus, analysisTimeLeft, revenueRequest]);

  useEffect(() => {
    let interval: any;
    if (analyzing) {
      setLoadingText('Procurando ofertas...');
      interval = setInterval(() => {
        setLoadingText(prev => prev === 'Procurando ofertas...' ? 'Verificando banco parceiro...' : 'Procurando ofertas...');
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [analyzing]);

  useEffect(() => {
    if (location.state?.verified) {
      setStep(2);
    }
  }, [location.state]);

  const [requestedAmount, setRequestedAmount] = useState('');
  const [offer, setOffer] = useState<{ approved: boolean, amount: number } | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [showPercentages, setShowPercentages] = useState(false);
  const [installments, setInstallments] = useState(12);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTaxDetails, setShowTaxDetails] = useState(false);
  const [error, setError] = useState('');
  const [sigiloPayResult, setSigiloPayResult] = useState<SigiloPayResponse | null>(null);
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  const [paymentDescription, setPaymentDescription] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const [vehicleData, setVehicleData] = useState({ brand: '', model: '', year: '', value: '' });

  const startAnalysis = () => {
    setError('');
    const hasActiveLoan = proposals.some(p => p.status === 'completed' || p.status === 'paid');
    if (hasActiveLoan) {
      setError("Você já possui um empréstimo ativo. Para solicitar um novo, é necessário quitar o atual.");
      return;
    }
    if (type === 'vehicle' && (!vehicleData.brand || !vehicleData.model || !vehicleData.year || !vehicleData.value)) {
      setError("Por favor, preencha todos os dados do veículo.");
      return;
    }
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      if (config.facialVerificationEnabled && !location.state?.verified && !profile?.facialVerificationUrl) {
        navigate('/verification', { state: { revenue: parseCurrency(revenue), type } });
      } else {
        setStep(2);
      }
    }, 7000);
  };

  const handleSimulate = () => {
    const rev = parseCurrency(revenue);
    const req = parseFloat(requestedAmount);
    
    if (!requestedAmount || isNaN(req) || req < 500) {
      setAnalyzing(true);
      setTimeout(() => {
        setAnalyzing(false);
        setOffer({ approved: false, amount: 0 });
      }, 7000);
      return;
    }
    
    setError('');
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      
      // Permitir solicitação de até +25% da renda declarada
      const maxAllowedReq = rev * 1.25;
      
      if (req > maxAllowedReq) {
        setOffer({ approved: false, amount: 0 });
      } else {
        // Oferecer 19.76% a menos do valor solicitado
        let maxOffer = req * 0.7924;
        
        const absoluteMax = rev * 1.25 * 0.7924;
        if (maxOffer > absoluteMax) maxOffer = absoluteMax;
        
        if (maxOffer < 50) {
          setOffer({ approved: false, amount: 0 });
        } else {
          setOffer({ approved: true, amount: maxOffer });
        }
      }
    }, 7000);
  };

  const calculateTaxes = (amount: number) => {
    return config?.platformFee || 29.90;
  };

  const calculateInstallment = (amount: number, months: number) => {
    const rate = 0.0589;
    const pmt = (amount * rate) / (1 - Math.pow(1 + rate, -months));
    return pmt;
  };

  const LegalFooter = () => (
    <div className="mt-8 pt-8 border-t border-zinc-100 space-y-6 text-[10px] text-zinc-400 leading-relaxed text-center">
      <div className="space-y-2">
        <p className="font-bold text-zinc-500 uppercase tracking-widest">Informações Legais</p>
        <p>
          A EmpireCred é uma plataforma digital que facilita o acesso ao crédito. Não somos uma instituição financeira. 
          O crédito é concedido por instituições parceiras autorizadas pelo Banco Central do Brasil.
        </p>
        <p>
          <strong>Período de repagamento:</strong> Mínimo de 3 meses e máximo de 12 meses. 
          <strong> Taxa de Juros (APR):</strong> Taxa mensal de 5,89% (98,6% ao ano).
        </p>
        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100 text-left">
          <p className="font-bold text-zinc-500 mb-1 uppercase tracking-tighter">Exemplo Representativo:</p>
          <p>
            Para um empréstimo de R$ 1.000,00 com pagamento em 12 parcelas mensais, cada parcela será de R$ 118,61. 
            O valor total a ser pago ao final do contrato será de R$ 1.423,32. 
            Este valor inclui juros de 5,89% ao mês e impostos (IOF).
          </p>
        </div>
      </div>
      <div className="flex justify-center space-x-4 font-bold uppercase tracking-widest">
        <button onClick={() => navigate('/privacy')} className="hover:text-zinc-900 transition-colors">Privacidade</button>
        <span>•</span>
        <button onClick={() => navigate('/terms')} className="hover:text-zinc-900 transition-colors">Termos</button>
      </div>
      <p>© 2026 EmpireCred. Todos os direitos reservados.</p>
    </div>
  );

  const handleContract = async () => {
    if (!selectedAmount) return;
    setStep(3);
  };

  const triggerProposalWebhook = async (proposalId: string, proposal: LoanProposal) => {
    if (!profile) return;
    
    const payload = {
      userId: profile.uid,
      proposalId: proposalId,
      approvedAmount: proposal.approvedAmount,
      phone: profile.phone,
      fullName: profile.fullName
    };

    try {
      // Disparar de forma assíncrona para não travar a experiência do usuário
      fetch('https://overcunning-preoffensively-senaida.ngrok-free.dev/webhook/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(payload)
      }).catch(err => console.error("Webhook Error:", err));
      
      console.log("Webhook triggered for proposal:", proposalId);
    } catch (error) {
      console.error("Error triggering webhook:", error);
    }
  };

  const finishContract = async (status: 'pending' | 'paid' = 'pending') => {
    if (!profile || !selectedAmount) return;
    setAnalyzing(true); 
    try {
      // Verificar se já existe uma proposta pendente para este usuário (criada no handleGeneratePayment)
      const q = query(
        collection(db, 'proposals'),
        where('userId', '==', profile.uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Atualiza a proposta existente
        await updateDoc(snapshot.docs[0].ref, {
          status: status,
          updatedAt: new Date().toISOString()
        });
        console.log(`Existing proposal ${snapshot.docs[0].id} updated to ${status}.`);
      } else {
        // Cria uma nova se não existir
        const proposal: LoanProposal = {
          userId: profile.uid,
          type: type as 'personal' | 'vehicle',
          monthlyRevenue: parseCurrency(revenue),
          requestedAmount: parseFloat(requestedAmount),
          approvedAmount: selectedAmount,
          installments: installments,
          interestRate: 5.89,
          status: status,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'proposals'), proposal);
        if (status === 'pending') {
          triggerProposalWebhook(docRef.id, proposal);
        }
        console.log("New proposal created.");
      }
      
      alert(`Sua proposta de R$ ${selectedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} foi enviada para análise final!`);
      navigate('/dashboard?success=true');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'proposals');
    } finally {
      setAnalyzing(false);
    }
  };

  const generateSchedule = (amount: number, months: number) => {
    const pmt = calculateInstallment(amount, months);
    const schedule = [];
    const today = new Date();
    
    for (let i = 1; i <= months; i++) {
      const date = new Date(today);
      date.setMonth(today.getMonth() + i);
      schedule.push({
        num: i,
        date: date.toLocaleDateString('pt-BR'),
        value: pmt.toFixed(2)
      });
    }
    return schedule;
  };

  const handleGeneratePayment = async (amount: number, description: string, method: 'pix' | 'boleto') => {
    if (!profile) return;
    setIsGeneratingPayment(true);
    setPaymentDescription(description);
    try {
      let response: SigiloPayResponse;
      if (method === 'pix') {
        response = await sigiloPayService.generatePix(amount, description, profile.uid);
      } else {
        // Para boleto também passamos o userId se necessário, mas o serviço ainda não foi atualizado para isso
        // Vou assumir que o usuário quer Pix principalmente
        response = await sigiloPayService.generatePix(amount, description, profile.uid);
      }
      
      if (!response.success) {
        throw new Error(response.error || "Erro ao gerar pagamento");
      }

      console.log("SigiloPay Result:", response);
      setSigiloPayResult(response);
      
      // Se for taxa de antecipação, mostra o modal específico de Pix/Boleto de antecipação
      if (description.includes("Taxa de Antecipação")) {
        // Modal será aberto automaticamente pelo setSigiloPayResult
      }

      // Criar proposta como pendente imediatamente para garantir que o webhook a encontre
      if (description.includes("Taxa de Antecipação") && selectedAmount) {
        const proposal: LoanProposal = {
          userId: profile.uid,
          type: type as 'personal' | 'vehicle',
          monthlyRevenue: parseCurrency(revenue),
          requestedAmount: parseFloat(requestedAmount),
          approvedAmount: selectedAmount,
          installments: installments,
          interestRate: 5.89,
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'proposals'), proposal);
        triggerProposalWebhook(docRef.id, proposal);
        console.log("Initial pending proposal created for webhook tracking.");
      }
    } catch (err: any) {
      console.error("SigiloPay Error:", err);
      alert(err.message || "Erro ao gerar pagamento. Tente novamente.");
    } finally {
      setIsGeneratingPayment(false);
    }
  };

  useEffect(() => {
    if (!sigiloPayResult) {
      setPaymentConfirmed(false);
    }
  }, [sigiloPayResult]);

  useEffect(() => {
    if (!profile?.uid) return;

    // Monitorar pagamentos confirmados do usuário de forma persistente
    const startTime = new Date().toISOString();

    const q = query(
      collection(db, 'payments'),
      where('userId', '==', profile.uid),
      where('status', '==', 'paid')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const newPayments = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.updatedAt && data.updatedAt >= startTime;
      });

      if (newPayments.length > 0) {
        for (const paymentDoc of newPayments) {
          const paymentData = paymentDoc.data();
          
          // Se for taxa de antecipação, atualizamos a proposta
          if (paymentData.description?.includes("Taxa de Antecipação")) {
            console.log("Loan fee payment detected:", paymentDoc.id);
            setPaymentConfirmed(true);

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
                console.log("Proposal updated to paid:", propDoc.id);
              }
            } catch (error) {
              console.error("Error updating proposal after payment:", error);
            }
          }
        }
      }
    });

    return () => unsubscribe();
  }, [profile?.uid]);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-zinc-50 sticky top-0 bg-white z-50">
        <button onClick={() => navigate('/dashboard')} className="text-zinc-400 print:hidden">
          <X size={24} />
        </button>
        <h1 className="font-bold text-lg text-zinc-900">Crédito</h1>
        <div className="w-6 print:hidden" /> {/* Spacer */}
      </header>

      <div className="pb-12">
        {/* Lifestyle Image */}
        <div className="w-full aspect-[16/10] overflow-hidden">
          <img 
            src={config.creditBannerUrl} 
            alt="Crédito" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="px-6 pt-8 space-y-8">
          {showSuccessMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start space-x-3"
            >
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                <Check size={18} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-emerald-900">Empréstimo solicitado!</p>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  O empréstimo foi solicitado e o usuário receberá o valor na conta em até 8 horas úteis.
                </p>
              </div>
            </motion.div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-medium text-center print:hidden">
              {error}
            </div>
          )}
          <h2 className="text-[26px] font-bold text-zinc-900 leading-tight">
            Aumente suas chances de conseguir uma oferta
          </h2>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Revenue Input Section */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Informe seu faturamento mensal</label>
                      {parseCurrency(revenue) > 0 && !isEditingRevenue && (
                        <button 
                          onClick={() => setIsEditingRevenue(true)}
                          className="text-[#008542] text-[10px] font-bold uppercase tracking-widest hover:underline print:hidden"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    
                    {isEditingRevenue ? (
                      <div className="space-y-4">
                        <div className="relative">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-zinc-400">R$</span>
                          <input 
                            type="text" 
                            inputMode="numeric"
                            value={revenue}
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '');
                              const formatted = (Number(val) / 100).toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              });
                              setRevenue(formatted);
                            }}
                            placeholder="0,00"
                            className="w-full bg-zinc-50 border-none rounded-2xl py-4 pl-12 pr-5 text-lg font-bold focus:ring-2 focus:ring-[#008542] outline-none"
                          />
                        </div>
                        <button 
                          onClick={() => {
                            if (revenue && revenue !== '0,00') {
                              setIsEditingRevenue(false);
                              const revVal = parseCurrency(revenue);
                              if (revVal !== profile?.monthlyRevenue) {
                                saveRevenueToDb(revenue);
                              }
                            }
                          }}
                          className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center space-x-2"
                        >
                          <Check size={20} />
                          <span>Confirmar Faturamento</span>
                        </button>
                      </div>
                    ) : (
                      <div className="bg-zinc-50 rounded-2xl py-4 px-5 border border-zinc-100 flex items-center justify-between">
                        <span className="font-bold text-lg text-zinc-900">
                          R$ {(profile?.monthlyRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {isInitialProcessing ? (
                          <div className="flex items-center space-x-2">
                            <motion.div 
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="w-4 h-4 border-2 border-[#008542] border-t-transparent rounded-full"
                            />
                          </div>
                        ) : revenueStatus === 'analyzing' ? (
                          <div className="bg-amber-50 px-3 py-1 rounded-lg border border-amber-100 flex items-center justify-center min-w-[90px]">
                            <span className="text-[10px] font-bold text-amber-600 uppercase text-center">Em análise</span>
                          </div>
                        ) : revenueStatus === 'waiting_proof' ? (
                          <div className="bg-amber-50 px-3 py-1 rounded-lg border border-amber-100 flex items-center space-x-1.5">
                            <span className="text-[10px] font-bold text-amber-600 uppercase">Aguardando</span>
                            <FileText size={12} className="text-amber-600" />
                          </div>
                        ) : revenueStatus === 'rejected' ? (
                          <div className="bg-red-50 px-3 py-1 rounded-lg border border-red-100 flex items-center space-x-1.5">
                            <span className="text-[10px] font-bold text-red-600 uppercase">Recusado</span>
                            <X size={12} className="text-red-600" />
                          </div>
                        ) : (
                          <div className="bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100 flex items-center space-x-1.5">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Aprovado</span>
                            <Check size={12} className="text-emerald-600" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {revenueRequest && (
                    <input 
                      type="file" 
                      id="proof-upload" 
                      className="hidden" 
                      onChange={handleProofUpload}
                      accept="image/*,application/pdf"
                    />
                  )}

                  {revenueStatus === 'waiting_proof' && revenueRequest && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-3 print:hidden"
                    >
                      <p className="text-xs text-amber-800 font-medium leading-relaxed">
                        {revenueRequest.proofMessage || 'Envie pelo menos um documento para comprovar seu faturamento.'}
                      </p>
                      <button 
                        onClick={() => document.getElementById('proof-upload')?.click()}
                        disabled={isUploadingProof}
                        className="w-full bg-amber-100 text-amber-800 py-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 hover:bg-amber-200 transition-colors disabled:opacity-50"
                      >
                        {isUploadingProof ? (
                          <div className="flex items-center space-x-2">
                            <motion.div 
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="w-4 h-4 border-2 border-amber-800 border-t-transparent rounded-full"
                            />
                            <span>Enviando...</span>
                          </div>
                        ) : (
                          <>
                            <Camera size={16} />
                            <span>Tirar foto ou anexar &gt;</span>
                          </>
                        )}
                      </button>
                    </motion.div>
                  )}

                  {revenueStatus === 'rejected' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-red-50 border border-red-100 rounded-xl print:hidden"
                    >
                      <p className="text-[10px] text-red-700 font-medium leading-relaxed">
                        Seu faturamento foi recusado. Por favor, informe um valor válido ou entre em contato com o suporte.
                      </p>
                    </motion.div>
                  )}

                  {revenueStatus === 'analyzing' && (
                    <div className="space-y-2 print:hidden">
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-amber-50 border border-amber-100 rounded-xl"
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-[10px] text-amber-700 font-medium leading-relaxed flex-1">
                            {revenueRequest?.proofUrl || (revenueRequest?.proofUrls && revenueRequest.proofUrls.length > 0)
                              ? "Documento enviado e nossa equipe está analisando os documentos enviados."
                              : "Sua renda está passando por uma análise pela nossa equipe."}
                          </p>
                          {(revenueRequest?.proofUrl || (revenueRequest?.proofUrls && revenueRequest.proofUrls.length > 0)) && (
                            <button 
                              onClick={() => document.getElementById('proof-upload')?.click()}
                              className="text-[10px] font-bold text-amber-600 uppercase tracking-widest hover:underline ml-2"
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      </motion.div>
                      {((config.revenueAnalysisTime || 60) - analysisTimeLeft) >= 10 && !revenueRequest?.proofUrl && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 bg-red-50 border border-red-100 rounded-xl"
                        >
                          <p className="text-[10px] text-red-700 font-medium leading-relaxed">
                            Poderemos exigir um comprovante de renda caso necessário.
                          </p>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {profile && profile.monthlyRevenue > 0 && revenueStatus === 'approved' && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm"
                    >
                      <p className="text-xs text-zinc-500 mb-1">Faturamento informado</p>
                      <p className="text-2xl font-bold text-zinc-900">
                        R$ {profile.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </motion.div>
                  )}
                </div>

                {/* Saiba Mais Section */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Saiba Mais</h3>
                  <div 
                    onClick={() => setShowScore(true)}
                    className="bg-white p-4 rounded-2xl border border-zinc-100 flex items-center justify-between shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center overflow-hidden">
                        {config.scoreIconUrl ? (
                          <img src={config.scoreIconUrl} alt="Score" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Sparkles size={24} className="text-zinc-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-zinc-900">Seu Score EmpireCred</p>
                        <p className="text-[10px] text-zinc-500">Descubra como melhorar suas ofertas e limites.</p>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-zinc-300 print:hidden" />
                  </div>
                </div>

                {/* Conteúdos Exclusivos */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Conteúdos Exclusivos</h3>
                  <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-hide">
                    <div onClick={() => { setActiveStorySet('financas'); setShowStories(true); setCurrentStoryIndex(0); }} className="cursor-pointer">
                      <ContentCard 
                        title="Finanças no verde" 
                        tag="Novidade" 
                        color="bg-[#008542]" 
                        image="https://imgur.com/dVCslT1.png"
                      />
                    </div>
                    <div onClick={() => { setActiveStorySet('dicas'); setShowStories(true); setCurrentStoryIndex(0); }} className="cursor-pointer">
                      <ContentCard 
                        title="Dicas de crédito" 
                        tag="Para você" 
                        color="bg-[#008542]" 
                        image="https://imgur.com/HHbzVtj.png"
                      />
                    </div>
                  </div>
                </div>

                {/* My Loans Section */}
                {proposals.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Meus Empréstimos</h3>
                    <div className="space-y-3">
                      {proposals.map(p => (
                        <div 
                          key={p.id} 
                          onClick={() => setExpandedProposal(expandedProposal === p.id ? null : p.id || null)}
                          className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm space-y-3 cursor-pointer active:scale-[0.98] transition-all"
                        >
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                {p.type === 'personal' ? 'Empréstimo Pessoal' : 'Crédito com Garantia'}
                              </p>
                              <p className="font-bold text-zinc-900">R$ {p.approvedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                              p.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                              p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              p.status === 'completed' ? 'bg-blue-50 text-blue-600' :
                              p.status === 'rejected' ? 'bg-red-50 text-red-600' :
                              'bg-amber-50 text-amber-600'
                            }`}>
                              {p.status === 'pending' ? 'Em análise' : 
                               p.status === 'approved' ? 'Aprovado' : 
                               p.status === 'paid' ? 'Pago' : 
                               p.status === 'completed' ? 'Finalizado' : 'Recusado'}
                            </div>
                          </div>
                          
                          {p.status === 'paid' && (
                            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                              <p className="text-[10px] text-emerald-800 font-medium leading-relaxed">
                                O dinheiro será depositado em sua conta "EmpireCred" em até 8 horas úteis.
                              </p>
                            </div>
                          )}

                          {p.status === 'completed' && (
                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                              <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                                O dinheiro foi depositado na sua conta.
                              </p>
                            </div>
                          )}

                          <div className="flex justify-between text-[10px] text-zinc-500">
                            <span>{p.installments}x de R$ {(p.approvedAmount * (1 + p.interestRate/100) / p.installments).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-emerald-600 font-bold">
                              {p.installments - (p.paidInstallments || 0)} parcelas restantes
                            </span>
                          </div>

                          <AnimatePresence>
                            {expandedProposal === p.id && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden print:overflow-visible pt-3 border-t border-zinc-50 space-y-4"
                              >
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Detalhamento das Parcelas</p>
                                  <div className="flex space-x-2 print:hidden">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const siteFee = calculateTaxes(p.approvedAmount);
                                        handleGeneratePayment(siteFee, `Taxa do Site - ${p.id}`, 'pix');
                                      }}
                                      className="flex items-center space-x-1 bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg text-[10px] font-bold"
                                    >
                                      <QrCode size={12} />
                                      <span>Gerar Pix</span>
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const siteFee = calculateTaxes(p.approvedAmount);
                                        handleGeneratePayment(siteFee, `Taxa do Site - ${p.id}`, 'boleto');
                                      }}
                                      className="flex items-center space-x-1 bg-blue-50 text-blue-600 px-2 py-1 rounded-lg text-[10px] font-bold"
                                    >
                                      <Receipt size={12} />
                                      <span>Gerar Boleto</span>
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
                                  {Array.from({ length: p.installments }).map((_, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-[10px] py-1.5 border-b border-zinc-50 last:border-0">
                                      <div className="flex items-center space-x-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${idx < (p.paidInstallments || 0) ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
                                        <span className="text-zinc-500">Parcela {idx + 1}</span>
                                      </div>
                                      <div className="flex items-center space-x-3">
                                        <span className="font-bold text-zinc-900">R$ {(p.approvedAmount * (1 + p.interestRate/100) / p.installments).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        {idx < (p.paidInstallments || 0) ? (
                                          <span className="text-emerald-600 font-bold uppercase text-[8px]">Pago</span>
                                        ) : (
                                          <span className="text-zinc-400 font-bold uppercase text-[8px]">Pendente</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Simulation Button */}
                <div className="pt-4 print:hidden">
                  <button 
                    onClick={startAnalysis}
                    disabled={analyzing || revenueStatus !== 'approved'}
                    className="w-full bg-[#008542] text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-100 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:grayscale"
                  >
                    {analyzing ? (
                      <div className="flex items-center space-x-2">
                        <div className="relative w-5 h-5">
                          <motion.div 
                            className="absolute inset-0 border-2 border-white/20 border-t-white rounded-full"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          />
                        </div>
                        <span>{loadingText}</span>
                      </div>
                    ) : (
                      <>
                        <span>Simular Crédito</span>
                        <ChevronRight size={20} />
                      </>
                    )}
                  </button>
                </div>

                <LegalFooter />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Simulation results logic remains similar but with updated styling */}
                <div className="bg-emerald-50 p-6 rounded-2xl flex items-center justify-between border border-emerald-100">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Faturamento Informado</p>
                    <p className="font-bold text-emerald-900">R$ {profile?.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase">Aprovado</div>
                </div>

                {!offer ? (
                  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Qual valor você deseja?</label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-zinc-400">R$</span>
                        <input 
                          type="number" 
                          value={requestedAmount}
                          onChange={e => setRequestedAmount(e.target.value)}
                          placeholder="0,00"
                          className="w-full bg-zinc-50 border-none rounded-2xl py-4 pl-12 pr-5 text-lg font-bold focus:ring-2 focus:ring-[#008542] outline-none"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={handleSimulate}
                      disabled={analyzing}
                      className="w-full bg-[#008542] text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-2"
                    >
                      {analyzing ? (
                        <div className="flex items-center space-x-2">
                          <div className="relative w-5 h-5">
                            <motion.div 
                              className="absolute inset-0 border-2 border-white/20 border-t-white rounded-full"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                          </div>
                          <span>{loadingText}</span>
                        </div>
                      ) : (
                        'Fazer uma simulação'
                      )}
                    </button>
                  </div>
                ) : !offer.approved ? (
                  <div className="bg-red-50 p-8 rounded-2xl text-center space-y-4 border border-red-100">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                      <AlertCircle size={32} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-red-900">Nenhuma oferta disponível</h3>
                    </div>
                    <button onClick={() => setOffer(null)} className="text-sm font-bold text-red-900 underline">Tentar outro valor</button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <img 
                            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7xj1NmsnIBboggf7IF-QH_WceRXBGWNmvHQ&s" 
                            alt="Creditas" 
                            className="h-6 object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Banco Parceiro</span>
                      </div>
                      
                      <button 
                        onClick={() => setShowPercentages(!showPercentages)}
                        className="w-full text-left space-y-2 group"
                      >
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Oferta disponível</p>
                        <div className="flex items-center justify-between">
                          <p className="text-2xl font-bold text-zinc-900">Até R$ {offer.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <ChevronRight size={20} className={`text-zinc-300 transition-transform ${showPercentages ? 'rotate-90' : ''}`} />
                        </div>
                      </button>

                      {showPercentages && (
                        <motion.div 
                          initial={{ opacity: 1, height: 'auto' }}
                          className="space-y-4 pt-4 border-t border-zinc-50"
                        >
                          <p className="text-sm font-bold text-zinc-900">Qual valor você deseja?</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[1, 0.8, 0.6, 0.4, 0.2]
                              .filter(pct => (offer.amount * pct) >= 50)
                              .map(pct => (
                                <button
                                  key={pct}
                                  onClick={() => setSelectedAmount(offer.amount * pct)}
                                  className={`py-3 rounded-xl text-[10px] font-bold border transition-all ${selectedAmount === offer.amount * pct ? 'bg-[#008542] border-[#008542] text-white' : 'bg-zinc-50 border-zinc-100 text-zinc-500'}`}
                                >
                                  R$ {(offer.amount * pct).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </button>
                              ))}
                          </div>
                        </motion.div>
                      )}

                      {selectedAmount && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-6 pt-6 border-t border-zinc-50"
                        >
                          <div className="space-y-4">
                            <div className="flex justify-between items-end">
                              <p className="text-sm font-bold text-zinc-900">Parcelamento:</p>
                              <div className="text-right">
                                <p className="text-[10px] text-zinc-400 uppercase font-bold">Total a pagar</p>
                                <p className="text-lg font-bold text-[#008542]">R$ {(calculateInstallment(selectedAmount, installments) * installments).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                            <select 
                              value={installments}
                              onChange={e => setInstallments(parseInt(e.target.value))}
                              className="w-full bg-zinc-50 border-none rounded-2xl py-4 px-5 text-sm font-bold outline-none"
                            >
                              {[3, 6, 9, 12].map(m => (
                                <option key={m} value={m}>{m}x de R$ {calculateInstallment(selectedAmount, m).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-zinc-400 text-center">Juros de 5,89% a.m. inclusos</p>
                          </div>

                          <button 
                            className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-xl disabled:opacity-50"
                            disabled={analyzing}
                            onClick={handleContract}
                          >
                            {analyzing ? (
                              <div className="flex items-center justify-center space-x-2">
                                <div className="relative w-5 h-5">
                                  <motion.div 
                                    className="absolute inset-0 border-2 border-white/20 border-t-white rounded-full"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                  />
                                </div>
                                <span>Processando...</span>
                              </div>
                            ) : 'Ver Detalhes do Contrato'}
                          </button>
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}

                <LegalFooter />
              </motion.div>
            )}
            {step === 3 && selectedAmount && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm space-y-6">
                  <div className="space-y-1">
                    <h3 className="font-bold text-zinc-900">Cronograma de Pagamento</h3>
                    <p className="text-xs text-zinc-500">Confira as datas e valores das suas parcelas.</p>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2 scrollbar-hide">
                    {generateSchedule(selectedAmount, installments).map(item => (
                      <div key={item.num} className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase">{item.num}ª Parcela</p>
                          <p className="text-xs font-bold text-zinc-900">({item.date})</p>
                        </div>
                        <p className="font-bold text-zinc-900">R$ {parseFloat(item.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-zinc-50 space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-zinc-500">Valor total contratado:</p>
                        <p className="text-sm font-bold text-zinc-900">R$ {selectedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-bold text-zinc-900">Total a pagar:</p>
                        <p className="text-lg font-bold text-[#008542]">R$ {(calculateInstallment(selectedAmount, installments) * installments).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    </div>

                    <label className="flex items-start space-x-3 cursor-pointer group">
                      <div className="pt-0.5">
                        <input 
                          type="checkbox" 
                          checked={termsAccepted}
                          onChange={e => setTermsAccepted(e.target.checked)}
                          className="w-5 h-5 rounded border-zinc-300 text-[#008542] focus:ring-[#008542]"
                        />
                      </div>
                      <span className="text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-700 transition-colors">
                        Li e concordo com os <a href="https://ae3tecnologia.com.br/lgpd/termo-de-uso" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline font-bold">Termos de Uso</a> e as condições do contrato de empréstimo.
                      </span>
                    </label>

                    {/* Tax Breakdown Section */}
                    <div className="space-y-2">
                      <button 
                        onClick={() => setShowTaxDetails(!showTaxDetails)}
                        className="w-full flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100 group transition-colors hover:bg-zinc-100"
                      >
                        <div className="flex items-center space-x-2">
                          <p className="text-[10px] font-bold text-zinc-600">
                            Inclui R$ {(config?.platformFee || 29.90).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de taxa da plataforma (impostos inclusos)
                          </p>
                          <Info size={14} className="text-zinc-400" />
                        </div>
                        <ChevronRight size={16} className={`text-zinc-400 transition-transform ${showTaxDetails ? 'rotate-90' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showTaxDetails && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200 space-y-2">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-zinc-500 font-medium">Impostos (IOF/ISS/CET)</span>
                                <span className="text-zinc-900 font-bold">Incluso</span>
                              </div>
                              <div className="flex justify-between text-[10px]">
                                <span className="text-zinc-500 font-medium">Taxa da plataforma</span>
                                <span className="text-zinc-900 font-bold">R$ {(config?.platformFee || 29.90).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        handleGeneratePayment(calculateTaxes(selectedAmount), "Taxa de Antecipação de Empréstimo", 'boleto');
                      }}
                      disabled={!termsAccepted}
                      className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      <Download size={20} />
                      <span>Pagar boleto de antecipação</span>
                    </button>
                    
                    <div className="text-center">
                      <button 
                        onClick={() => {
                          handleGeneratePayment(calculateTaxes(selectedAmount), "Taxa de Antecipação de Empréstimo", 'pix');
                        }}
                        disabled={!termsAccepted}
                        className="text-xs font-bold text-[#008542] hover:underline disabled:opacity-50"
                      >
                        Ou pagar via Pix para liberação imediata
                      </button>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <p className="text-[10px] text-[#008542] leading-relaxed text-center flex flex-wrap items-center justify-center gap-1">
                        <strong>Aviso:</strong> Após pagar a taxa da plataforma (boleto de antecipação ou via PIX), o valor do empréstimo aprovado é depositado em até 10 minutos pela instituição parceira direto na sua conta empire. 
                        <img src="https://imgur.com/tOniE14.png" alt="Empire" className="h-[20px] w-auto inline-block align-middle" referrerPolicy="no-referrer" />
                      </p>
                    </div>

                    <p className="text-[10px] text-zinc-400 text-center">Taxas de impostos inclusas na antecipação (R$29,90)</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {sigiloPayResult && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-[380px] bg-white rounded-[24px] p-6 space-y-4 overflow-y-auto max-h-[90vh] shadow-2xl scrollbar-hide"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900">
                  {paymentConfirmed ? 'Pagamento Confirmado' : 'Pagamento Seguro'}
                </h3>
                <button onClick={() => setSigiloPayResult(null)} className="text-zinc-400 p-1">
                  <X size={20} />
                </button>
              </div>

              {paymentConfirmed ? (
                <div className="text-center space-y-6 py-8">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600"
                  >
                    <Check size={40} />
                  </motion.div>
                  <div className="space-y-2">
                    <h4 className="text-xl font-bold text-zinc-900">Tudo pronto!</h4>
                    <p className="text-sm text-zinc-500">
                      Seu pagamento foi identificado com sucesso. Nossa equipe já está processando sua solicitação.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setSigiloPayResult(null);
                      if (step === 3) finishContract('paid');
                    }}
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg"
                  >
                    Continuar
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-[#008542]">
                    {sigiloPayResult.pixCode ? <QrCode size={32} /> : <Receipt size={32} />}
                  </div>
                  
                  <div className="space-y-1">
                    <h4 className="font-bold text-zinc-900">Pagamento Gerado</h4>
                    <p className="text-xs text-zinc-500">
                      Use os dados abaixo para realizar o pagamento da sua {paymentDescription.toLowerCase().includes('parcela') ? 'parcela' : 'taxa de antecipação'} de forma segura.
                    </p>
                    {sigiloPayResult.amount && (
                      <div className="mt-2 py-1.5 px-4 bg-emerald-50 text-[#008542] rounded-full inline-block font-bold text-base">
                        Valor: R$ {sigiloPayResult.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>

                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 space-y-3">
                    {sigiloPayResult.pixCode ? (
                      <div className="space-y-3">
                        <div className="w-32 h-32 bg-white p-2 rounded-lg mx-auto border border-zinc-100">
                          <img src={sigiloPayResult.pixQrCode} alt="QR Code" className="w-full h-full" />
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-zinc-100">
                          {sigiloPayResult.pixCode && (
                            <p className="text-[10px] text-zinc-400 font-mono break-all opacity-60 px-4 text-center mb-2">
                              {sigiloPayResult.pixCode}
                            </p>
                          )}
                        </div>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(sigiloPayResult.pixCode!);
                            setCopied('pix');
                            setTimeout(() => setCopied(null), 2000);
                          }}
                          className="flex items-center justify-center space-x-2 w-full text-[#008542] text-xs font-bold uppercase tracking-widest relative py-2"
                        >
                          <AnimatePresence mode="wait">
                            {copied === 'pix' ? (
                              <motion.div 
                                key="copied"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center space-x-2"
                              >
                                <Check size={16} />
                                <span>Copiado com sucesso!</span>
                              </motion.div>
                            ) : (
                              <motion.div 
                                key="copy"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center space-x-2"
                              >
                                <Copy size={16} />
                                <span>Copiar Código Pix</span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {sigiloPayResult.paymentLink && (
                          <div className="w-full aspect-[3/4] bg-white rounded-xl border border-zinc-100 overflow-hidden">
                            <iframe 
                              src={sigiloPayResult.paymentLink} 
                              className="w-full h-full border-none"
                              title="Prévia do Boleto"
                            />
                          </div>
                        )}
                        <p className="font-mono text-[10px] text-zinc-600 break-all bg-white p-3 rounded-lg border border-zinc-100">
                          {sigiloPayResult.barcode}
                        </p>
                        <div className="flex flex-col space-y-2">
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(sigiloPayResult.barcode!);
                              setCopied('barcode');
                              setTimeout(() => setCopied(null), 2000);
                            }}
                            className="flex items-center justify-center space-x-2 w-full text-[#008542] text-xs font-bold uppercase tracking-widest relative py-2"
                          >
                            <AnimatePresence mode="wait">
                              {copied === 'barcode' ? (
                                <motion.div 
                                  key="copied"
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  className="flex items-center space-x-2"
                                >
                                  <Check size={16} />
                                  <span>Copiado com sucesso!</span>
                                </motion.div>
                              ) : (
                                <motion.div 
                                  key="copy"
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  className="flex items-center space-x-2"
                                >
                                  <Copy size={16} />
                                  <span>Copiar Código de Barras</span>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </button>
                          {sigiloPayResult.paymentLink && (
                            <a 
                              href={sigiloPayResult.paymentLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center justify-center space-x-2 w-full bg-[#008542] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest"
                            >
                              <Download size={16} />
                              <span>Baixar PDF do Boleto</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        if (step === 3) finishContract('paid');
                        setSigiloPayResult(null);
                      }}
                      className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold shadow-xl"
                    >
                      Já realizei o pagamento
                    </button>
                    <button 
                      onClick={() => setSigiloPayResult(null)}
                      className="w-full text-zinc-400 py-2 text-xs font-bold uppercase tracking-widest"
                    >
                      Pagar depois
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isGeneratingPayment && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center space-y-4">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 border-4 border-[#008542] border-t-transparent rounded-full"
              />
              <p className="text-sm font-bold text-zinc-900">Gerando um pagamento seguro...</p>
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScore && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-white overflow-y-auto"
          >
            <div className="px-6 py-8 space-y-8 pb-32">
              <button 
                onClick={() => setShowScore(false)}
                className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-900"
              >
                <ChevronLeft size={24} />
              </button>

              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-zinc-900">Score</h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Confira como você pode ter acesso a ofertas exclusivas e limites melhores para o seu perfil.
                </p>
              </div>

              {/* Gauge Card */}
              <div className="bg-white rounded-[32px] p-8 border border-zinc-100 shadow-sm space-y-8 text-center">
                <div className="relative w-64 h-32 mx-auto">
                  <svg viewBox="0 0 200 100" className="w-full h-full">
                    {/* Background Track */}
                    <path
                      d="M 20 100 A 80 80 0 0 1 180 100"
                      fill="none"
                      stroke="#FEE2E2"
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                    {/* Dotted background */}
                    <path
                      d="M 20 100 A 80 80 0 0 1 180 100"
                      fill="none"
                      stroke="#FEE2E2"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray="1 4"
                    />
                    {/* Progress (Low Score) */}
                    <path
                      d="M 20 100 A 80 80 0 0 1 35 53"
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                    {/* Needle */}
                    <motion.line 
                      initial={{ rotate: -90 }}
                      animate={{ rotate: -75 }}
                      x1="100" y1="100" 
                      x2="100" y2="40" 
                      stroke="#18181B" 
                      strokeWidth="3" 
                      strokeLinecap="round" 
                      style={{ originX: "100px", originY: "100px" }}
                    />
                    <circle cx="100" cy="100" r="4" fill="#18181B" />
                  </svg>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-zinc-900">
                    Seu score é <span className="text-red-600">Baixo</span>
                  </h3>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-[240px] mx-auto">
                    O score é atualizado todo mês. Quanto maior, melhores são suas ofertas e limites.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-lg font-bold text-zinc-900">Como aumentar o meu score?</h3>
                
                <div className="flex flex-col space-y-4">
                  {/* Card 1 */}
                  <div className="w-full bg-white rounded-[32px] p-6 border border-zinc-100 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                        <FileText size={24} />
                      </div>
                      {(revenueStatus === 'approved' || (revenueRequest && (revenueRequest.proofUrl || (revenueRequest.proofUrls && revenueRequest.proofUrls.length > 0)))) && (
                        <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-bold">
                          R$ {(revenueRequest?.revenue || profile?.monthlyRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-bold text-zinc-900">Comprove seu faturamento</h4>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {uploadSuccess || (revenueRequest && (revenueRequest.proofUrl || (revenueRequest.proofUrls && revenueRequest.proofUrls.length > 0))) 
                          ? "Documento enviado com sucesso! Aguarde a análise."
                          : "Envie pelo menos um documento para comprovar seu faturamento atualizado."}
                      </p>
                    </div>
                    {(uploadSuccess || (revenueRequest && (revenueRequest.proofUrl || (revenueRequest.proofUrls && revenueRequest.proofUrls.length > 0)))) && !isEditingProof ? (
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl w-fit">
                          <Check size={16} />
                          <span className="text-xs font-bold">Enviado</span>
                        </div>
                        <button 
                          onClick={() => setIsEditingProof(true)}
                          className="text-zinc-400 hover:text-zinc-900 text-xs font-bold flex items-center"
                        >
                          <Edit2 size={14} className="mr-1" />
                          Editar
                        </button>
                      </div>
                    ) : (
                      <>
                        <input 
                          type="file" 
                          id="revenue-proof" 
                          className="hidden" 
                          onChange={handleProofUpload}
                          accept="image/*,.pdf"
                        />
                        <div className="flex items-center justify-between w-full">
                          <button 
                            onClick={() => document.getElementById('revenue-proof')?.click()}
                            disabled={isUploadingProof}
                            className="text-[#008542] text-sm font-bold flex items-center disabled:opacity-50"
                          >
                            {isUploadingProof ? 'Enviando...' : 'Tirar foto ou anexar'} <ChevronRight size={16} className="ml-1" />
                          </button>
                          {isEditingProof && (
                            <button 
                              onClick={() => setIsEditingProof(false)}
                              className="text-zinc-400 hover:text-zinc-900 text-xs font-bold"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Button */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-zinc-50">
              <button 
                onClick={() => setShowScore(false)}
                className="w-full bg-[#008542] text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-100"
              >
                Conferir trilha de evolução
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stories Modal */}
      <AnimatePresence>
        {showStories && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col"
          >
            {/* Progress Bars */}
            <div className="absolute top-10 left-0 right-0 px-4 flex gap-1 z-50">
              {stories.map((_, idx) => (
                <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                  {idx === currentStoryIndex && (
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 5, ease: "linear" }}
                      className="h-full bg-emerald-500"
                    />
                  )}
                  {idx < currentStoryIndex && <div className="h-full w-full bg-emerald-500" />}
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-14 left-0 right-0 px-6 flex items-center justify-between z-50">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center overflow-hidden">
                  <img src="https://imgur.com/LW2vcqM.png" alt="Logo" className="w-6 h-6 object-contain" />
                </div>
                <span className="text-white font-bold text-sm">{activeStorySet === 'financas' ? 'Finanças no verde' : 'Dicas de crédito'}</span>
              </div>
              <button onClick={() => { setShowStories(false); setActiveStorySet(null); }} className="text-white/70 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Story Content */}
            <div className="flex-1 relative flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.img 
                  key={currentStoryIndex}
                  src={stories[currentStoryIndex]}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="max-h-full max-w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </AnimatePresence>

              {/* Navigation Areas */}
              <div className="absolute inset-0 flex">
                <div 
                  className="w-1/3 h-full cursor-pointer" 
                  onClick={() => setCurrentStoryIndex(prev => Math.max(0, prev - 1))}
                />
                <div 
                  className="w-2/3 h-full cursor-pointer" 
                  onClick={() => {
                    if (currentStoryIndex >= stories.length - 1) {
                      setShowStories(false);
                    } else {
                      setCurrentStoryIndex(prev => prev + 1);
                    }
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LoanSimulation;

function ContentCard({ title, tag, color, image }: { title: string, tag: string, color: string, image?: string }) {
  return (
    <div className={`min-w-[200px] h-32 ${color} rounded-2xl p-4 flex flex-col justify-between text-white relative overflow-hidden`}>
      {image && (
        <img 
          src={image} 
          alt={title} 
          className="absolute inset-0 w-full h-full object-cover opacity-60" 
          referrerPolicy="no-referrer"
        />
      )}
      <div className="flex items-center space-x-1.5 bg-white/20 w-fit px-2 py-0.5 rounded-lg relative z-10">
        <Play size={10} fill="currentColor" />
        <span className="text-[10px] font-bold uppercase">{tag}</span>
      </div>
      <p className="font-bold text-sm relative z-10">{title}</p>
      {!image && <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />}
    </div>
  );
}
