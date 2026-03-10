import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Camera, Check, MapPin, User, FileText, Mail, Phone } from 'lucide-react';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';

export default function Registration({ onRegister }: { onRegister: (u: any, p: UserProfile) => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    motherName: '',
    cpf: '',
    birthDate: '',
    terms: false,
    email: auth.currentUser?.email || '',
    password: '',
    phone: '',
    cep: '',
    street: '',
    number: '',
    reference: '',
    docType: 'RG' as 'RG' | 'CNH' | 'Passaporte',
  });

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const [files, setFiles] = useState<{ front?: File; back?: File }>({});
  const [error, setError] = useState('');
  const [docTypeSelected, setDocTypeSelected] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{ side: 'front' | 'back', file: File } | null>(null);

  const handleCpfChange = (v: string) => {
    // Remove non-digits
    const digits = v.replace(/\D/g, '');
    let masked = digits;
    if (digits.length > 3) masked = digits.substring(0, 3) + '.' + digits.substring(3);
    if (digits.length > 6) masked = masked.substring(0, 7) + '.' + digits.substring(6);
    if (digits.length > 9) masked = masked.substring(0, 11) + '-' + digits.substring(9);
    
    // Limit to 14 characters (000.000.000-00)
    setFormData({ ...formData, cpf: masked.substring(0, 14) });
  };

  const handleCepChange = async (v: string) => {
    const digits = v.replace(/\D/g, '');
    let masked = digits;
    if (digits.length > 5) masked = digits.substring(0, 5) + '-' + digits.substring(5);
    
    const finalCep = masked.substring(0, 9);
    setFormData(prev => ({ ...prev, cep: finalCep }));

    if (digits.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setFormData(prev => ({ ...prev, cep: finalCep, street: data.logradouro }));
        }
      } catch (e) {
        console.error("CEP fetch error", e);
      }
    }
  };

  const handlePhoneChange = (v: string) => {
    const digits = v.replace(/\D/g, '');
    let masked = digits;
    if (digits.length > 0) masked = '(' + digits;
    if (digits.length > 2) masked = '(' + digits.substring(0, 2) + ') ' + digits.substring(2);
    if (digits.length > 7) masked = '(' + digits.substring(0, 2) + ') ' + digits.substring(2, 7) + '-' + digits.substring(7);
    
    setFormData({ ...formData, phone: masked.substring(0, 15) });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    if (e.target.files?.[0]) {
      setShowConfirmModal({ side, file: e.target.files[0] });
    }
  };

  const confirmFile = () => {
    if (showConfirmModal) {
      setFiles(prev => ({ ...prev, [showConfirmModal.side]: showConfirmModal.file }));
      setShowConfirmModal(null);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    
    try {
      // 1. Auth
      let user = auth.currentUser;
      if (!user) {
        console.log("Creating Auth user...");
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        user = userCredential.user;
        await sendEmailVerification(user).catch(e => console.error("Email verification error", e));
      }
      const uid = user.uid;

      // 2. Start the 5s visual wait
      const visualWait = new Promise(resolve => setTimeout(resolve, 5000));

        // 3. Perform the database write
        const dbWrite = (async () => {
          let frontUrl = '';
          let backUrl = '';

          // Upload documents to the backend API
          try {
            console.log("Uploading documents to backend...");
            if (files.front && files.back) {
              const formDataUpload = new FormData();
              formDataUpload.append('cpf', formData.cpf); // Envia o CPF para o nome do arquivo
              formDataUpload.append('front', files.front);
              formDataUpload.append('back', files.back);

              const uploadRes = await fetch('/api/upload-document', {
                method: 'POST',
                body: formDataUpload,
              });

              if (!uploadRes.ok) {
                const contentType = uploadRes.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                  const errorData = await uploadRes.json();
                  throw new Error(errorData.error || 'Erro no upload dos documentos');
                } else {
                  const text = await uploadRes.text();
                  console.error('Non-JSON error response:', text.substring(0, 100));
                  throw new Error('O servidor retornou uma resposta inválida (não JSON).');
                }
              }

              const contentType = uploadRes.headers.get('content-type');
              if (!contentType || !contentType.includes('application/json')) {
                const text = await uploadRes.text();
                console.error('Non-JSON response received:', text.substring(0, 100));
                throw new Error('O servidor retornou uma resposta inválida (não JSON).');
              }

              const uploadData = await uploadRes.json();
              frontUrl = uploadData.frontUrl;
              backUrl = uploadData.backUrl;
            }
          } catch (e) {
            console.error("Upload error:", e);
            throw e;
          }

          const newProfile: UserProfile = {
          uid,
          fullName: formData.fullName,
          motherName: formData.motherName,
          cpf: formData.cpf,
          birthDate: formData.birthDate,
          email: user.email || formData.email,
          password: formData.password,
          phone: formData.phone,
          address: {
            cep: formData.cep,
            street: formData.street,
            number: formData.number,
            reference: formData.reference
          },
          document: {
            type: formData.docType,
            frontUrl: frontUrl,
            backUrl: backUrl
          },
          balance: 0,
          monthlyRevenue: 0,
          role: 'user',
          createdAt: new Date().toISOString()
        };

        console.log("Saving profile to Firestore...");
        await setDoc(doc(db, 'users', uid), newProfile);
        console.log("Profile saved successfully!");
        return newProfile;
      })();

      // 4. Wait for BOTH (minimum 5s, or longer if DB is slow)
      const [_, profileData] = await Promise.all([visualWait, dbWrite]);

      // 5. Success!
      onRegister(user, profileData);
      setLoading(false);
      navigate('/dashboard');

    } catch (err: any) {
      console.error("Registration error:", err);
      let msg = "Erro ao salvar dados: " + (err.message || "Verifique sua conexão.");
      if (err.code === 'auth/email-already-in-use') msg = "E-mail já em uso.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex space-x-2">
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={`h-1 rounded-full transition-all duration-300 ${step >= s ? 'w-8 bg-emerald-500' : 'w-4 bg-zinc-100'}`}
            />
          ))}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Passo {step} de 3</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Dados Pessoais</h2>
              <p className="text-zinc-500 text-sm">Comece informando seus dados básicos.</p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-medium space-y-2">
                <p>{error}</p>
                {error.includes('já está em uso') && (
                  <div className="flex flex-col space-y-2">
                    <button 
                      onClick={() => navigate('/')}
                      className="text-emerald-600 underline font-bold block text-left"
                    >
                      Ir para o Login
                    </button>
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-4">
              <Input label="Nome Completo" required value={formData.fullName} onChange={v => setFormData({...formData, fullName: v})} icon={<User size={18}/>} />
              <Input label="Nome da Mãe" required value={formData.motherName} onChange={v => setFormData({...formData, motherName: v})} icon={<User size={18}/>} />
              <Input label="CPF" required value={formData.cpf} onChange={handleCpfChange} placeholder="000.000.000-00" />
              <Input label="Data de Nascimento" required type="date" value={formData.birthDate} onChange={v => setFormData({...formData, birthDate: v})} />
              
              <label className="flex items-center space-x-3 p-4 bg-zinc-50 rounded-2xl cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formData.terms} 
                  onChange={e => setFormData({...formData, terms: e.target.checked})}
                  className="w-5 h-5 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500" 
                />
                <span className="text-xs text-zinc-600">
                  Aceito os <a href="https://empirecred.com/termos" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline font-bold">Termos de uso</a> e política de privacidade.
                </span>
              </label>
            </div>

            <div className="flex space-x-4">
              <button 
                onClick={() => navigate('/')}
                className="flex-1 py-4 rounded-2xl font-semibold border border-zinc-200"
              >
                Voltar
              </button>
              <button 
                disabled={!formData.fullName || !formData.cpf || !formData.terms}
                onClick={() => setStep(2)}
                className="flex-[2] bg-zinc-900 text-white py-4 rounded-2xl font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <span>Próximo</span>
                <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Contato e Endereço</h2>
              <p className="text-zinc-500 text-sm">Onde podemos te encontrar?</p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-medium space-y-2">
                <p>{error}</p>
                {error.includes('já está em uso') && (
                  <div className="flex flex-col space-y-2">
                    <button 
                      onClick={() => navigate('/')}
                      className="text-emerald-600 underline font-bold block text-left"
                    >
                      Ir para o Login
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <Input label="Email" required type="email" value={formData.email} onChange={v => setFormData({...formData, email: v})} icon={<Mail size={18}/>} />
              <Input label="Senha" required type="password" value={formData.password} onChange={v => setFormData({...formData, password: v})} />
              <Input label="Telefone" required value={formData.phone} onChange={handlePhoneChange} placeholder="(00) 00000-0000" icon={<Phone size={18}/>} iconRight />
              <div className="grid grid-cols-2 gap-4">
                <Input label="CEP" required value={formData.cep} onChange={handleCepChange} placeholder="00000-000" icon={<MapPin size={18}/>} />
                <Input label="Número" required value={formData.number} onChange={v => setFormData({...formData, number: v})} />
              </div>
              <Input label="Rua" required value={formData.street} onChange={v => setFormData({...formData, street: v})} />
              <Input label="Referência (Opcional)" value={formData.reference} onChange={v => setFormData({...formData, reference: v})} />
            </div>

            <div className="flex space-x-4">
              <button onClick={() => setStep(1)} className="flex-1 py-4 rounded-2xl font-semibold border border-zinc-200">Voltar</button>
              <button 
                disabled={!formData.email || !formData.cep || !formData.street}
                onClick={() => setStep(3)}
                className="flex-[2] bg-zinc-900 text-white py-4 rounded-2xl font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <span>Próximo</span>
                <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Documentação</h2>
              <p className="text-zinc-500 text-sm">Envie uma foto do seu documento.</p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-medium space-y-2">
                <p>{error}</p>
                {error.includes('já está em uso') && (
                  <div className="flex flex-col space-y-2">
                    <button 
                      onClick={() => navigate('/')}
                      className="text-emerald-600 underline font-bold block text-left"
                    >
                      Ir para o Login
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-bold text-zinc-400 uppercase">Selecione o tipo de documento</p>
                <div className="flex space-x-2">
                  {(['RG', 'CNH', 'Passaporte'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => {
                        setFormData({...formData, docType: type});
                        setDocTypeSelected(true);
                      }}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${formData.docType === type && docTypeSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-zinc-100 text-zinc-400'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {docTypeSelected && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-zinc-400 uppercase">Frente do Documento</p>
                    <label className="block w-full h-32 border-2 border-dashed border-zinc-100 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 transition-colors">
                      <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'front')} accept="image/*" capture="environment" />
                      {files.front ? (
                        <div className="flex items-center space-x-2 text-emerald-600">
                          <Check size={20} />
                          <span className="text-sm font-medium">{files.front.name}</span>
                        </div>
                      ) : (
                        <>
                          <Camera className="text-zinc-300 mb-2" size={24} />
                          <span className="text-xs text-zinc-400">Tirar foto ou anexar</span>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-zinc-400 uppercase">Verso do Documento</p>
                    <label className="block w-full h-32 border-2 border-dashed border-zinc-100 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 transition-colors">
                      <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'back')} accept="image/*" capture="environment" />
                      {files.back ? (
                        <div className="flex items-center space-x-2 text-emerald-600">
                          <Check size={20} />
                          <span className="text-sm font-medium">{files.back.name}</span>
                        </div>
                      ) : (
                        <>
                          <Camera className="text-zinc-300 mb-2" size={24} />
                          <span className="text-xs text-zinc-400">Tirar foto ou anexar</span>
                        </>
                      )}
                    </label>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="flex space-x-4">
              <button onClick={() => setStep(2)} className="flex-1 py-4 rounded-2xl font-semibold border border-zinc-200">Voltar</button>
              <button 
                disabled={loading || !files.front || !files.back || !docTypeSelected}
                onClick={handleSubmit}
                className="flex-[2] bg-zinc-900 text-white py-4 rounded-2xl font-semibold flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="relative w-5 h-5">
                      <motion.div 
                        className="absolute inset-0 border-2 border-white/20 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                    </div>
                    <span>Cadastrando...</span>
                  </div>
                ) : (
                  <>
                    <span>Finalizar Cadastro</span>
                    <Check size={20} />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowConfirmModal(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white w-full rounded-3xl p-8 space-y-6 text-center"
            >
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                <Camera size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">A foto está nítida?</h3>
                <p className="text-sm text-zinc-500">
                  Certifique-se de que todos os dados do documento estão legíveis e sem reflexos.
                </p>
              </div>
              <div className="flex space-x-3">
                <button 
                  onClick={() => setShowConfirmModal(null)}
                  className="flex-1 py-4 rounded-2xl font-bold border border-zinc-100 text-zinc-400"
                >
                  Tirar outra
                </button>
                <button 
                  onClick={confirmFile}
                  className="flex-1 bg-zinc-900 text-white py-4 rounded-2xl font-bold"
                >
                  Sim, está ótima
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', icon, placeholder, required, iconRight }: { label: string, value: string, onChange: (v: string) => void, type?: string, icon?: React.ReactNode, placeholder?: string, required?: boolean, iconRight?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">
        {required && <span className="text-red-500 mr-1">*</span>}
        {label}
      </label>
      <div className="relative">
        <input 
          type={type} 
          value={value} 
          onChange={e => onChange(e.target.value)} 
          placeholder={placeholder}
          className="w-full bg-zinc-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
        />
        {icon && <div className={`absolute ${iconRight ? 'right-5' : 'right-5'} top-1/2 -translate-y-1/2 text-zinc-300`}>{icon}</div>}
      </div>
    </div>
  );
}
