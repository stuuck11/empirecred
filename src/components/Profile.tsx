import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Mail, Phone, MapPin, Trash2, Shield, Edit2, Check, X } from 'lucide-react';
import { UserProfile } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { deleteUser, signOut } from 'firebase/auth';

export default function Profile({ profile, onLogout }: { profile: UserProfile, onLogout: () => void }) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (window.confirm('Deseja salvar as alterações em seu perfil?')) {
      setSaving(true);
      try {
        const userRef = doc(db, 'users', profile.uid);
        await updateDoc(userRef, {
          phone: editedProfile.phone,
          cpf: editedProfile.cpf,
          motherName: editedProfile.motherName,
          address: editedProfile.address
        });
        setIsEditing(false);
        alert('Perfil atualizado com sucesso!');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
        alert('Erro ao atualizar perfil.');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm('Tem certeza que deseja excluir sua conta? Esta ação é irreversível e todos os seus dados serão apagados.')) {
      setSaving(true);
      try {
        // 1. Delete Firestore profile
        const userRef = doc(db, 'users', profile.uid);
        await deleteDoc(userRef);
        
        // 2. Delete Auth user
        const user = auth.currentUser;
        if (user) {
          await deleteUser(user);
        }
        
        onLogout();
        navigate('/');
        alert('Sua conta foi excluída com sucesso.');
      } catch (error: any) {
        console.error("Error deleting account:", error);
        if (error.code === 'auth/requires-recent-login') {
          alert('Para excluir sua conta, você precisa ter feito login recentemente. Por favor, saia e entre novamente.');
        } else {
          alert('Erro ao excluir conta. Por favor, entre em contato com o suporte.');
        }
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F9] pb-12 font-sans">
      <header className="bg-[#008542] px-6 pt-12 pb-24 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
        
        <div className="flex items-center justify-between relative z-10">
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm"
          >
            <ChevronLeft size={24} />
          </motion.button>
          <h1 className="text-lg font-bold">Meu Perfil</h1>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            disabled={saving}
            className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm"
          >
            {isEditing ? <Check size={20} /> : <Edit2 size={20} />}
          </motion.button>
        </div>

        <div className="mt-8 flex flex-col items-center relative z-10">
          <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md mb-4 border border-white/30">
            <User size={48} className="text-white" />
          </div>
          <h2 className="text-xl font-bold">{profile.fullName}</h2>
          <p className="text-sm opacity-70">{profile.role === 'admin' ? 'Administrador' : 'Cliente'}</p>
        </div>
      </header>

      <div className="px-4 -mt-12 space-y-4 relative z-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 space-y-6"
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Informações Pessoais</h3>
              {isEditing && (
                <button onClick={() => { setIsEditing(false); setEditedProfile(profile); }} className="text-xs text-red-500 font-bold">Cancelar</button>
              )}
            </div>
            
            <InfoItem icon={<Mail size={18} />} label="E-mail" value={profile.email} />
            
            <EditableInfoItem 
              icon={<User size={18} />} 
              label="CPF" 
              value={editedProfile.cpf} 
              isEditing={isEditing}
              onChange={(v) => setEditedProfile({...editedProfile, cpf: v})}
            />
            
            <EditableInfoItem 
              icon={<Phone size={18} />} 
              label="Telefone" 
              value={editedProfile.phone} 
              isEditing={isEditing}
              onChange={(v) => setEditedProfile({...editedProfile, phone: v})}
            />
            
            <EditableInfoItem 
              icon={<Shield size={18} />} 
              label="Mãe" 
              value={editedProfile.motherName} 
              isEditing={isEditing}
              onChange={(v) => setEditedProfile({...editedProfile, motherName: v})}
            />
          </div>

          <div className="pt-6 border-t border-zinc-50 space-y-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Endereço</h3>
            
            <div className="space-y-4">
              <EditableInfoItem 
                icon={<MapPin size={18} />} 
                label="Rua" 
                value={editedProfile.address.street} 
                isEditing={isEditing}
                onChange={(v) => setEditedProfile({...editedProfile, address: {...editedProfile.address, street: v}})}
              />
              <div className="grid grid-cols-2 gap-4">
                <EditableInfoItem 
                  icon={<MapPin size={18} />} 
                  label="Número" 
                  value={editedProfile.address.number} 
                  isEditing={isEditing}
                  onChange={(v) => setEditedProfile({...editedProfile, address: {...editedProfile.address, number: v}})}
                />
                <EditableInfoItem 
                  icon={<MapPin size={18} />} 
                  label="CEP" 
                  value={editedProfile.address.cep} 
                  isEditing={isEditing}
                  onChange={(v) => setEditedProfile({...editedProfile, address: {...editedProfile.address, cep: v}})}
                />
              </div>
              <EditableInfoItem 
                icon={<MapPin size={18} />} 
                label="Referência" 
                value={editedProfile.address.reference || ''} 
                isEditing={isEditing}
                onChange={(v) => setEditedProfile({...editedProfile, address: {...editedProfile.address, reference: v}})}
              />
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 space-y-4"
        >
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Segurança</h3>
          <button 
            onClick={() => navigate('/change-pin')}
            className="w-full flex items-center justify-between p-4 bg-zinc-50 rounded-2xl hover:bg-zinc-100 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                <Shield size={20} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-zinc-900">Senha de 6 dígitos</p>
                <p className="text-[10px] text-zinc-500">Alterar minha senha numérica</p>
              </div>
            </div>
            <ChevronLeft size={20} className="text-zinc-300 rotate-180" />
          </button>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100"
        >
          <button 
            onClick={handleDeleteAccount}
            className="w-full py-4 rounded-2xl bg-red-50 text-red-500 font-bold flex items-center justify-center space-x-2 hover:bg-red-100 transition-colors"
          >
            <Trash2 size={20} />
            <span>Excluir minha conta</span>
          </button>
          <p className="text-[10px] text-zinc-400 text-center mt-4 px-4">
            Ao excluir sua conta, todos os seus dados serão removidos permanentemente de nossos sistemas.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value, subValue }: { icon: React.ReactNode, label: string, value: string, subValue?: string }) {
  return (
    <div className="flex items-start space-x-4">
      <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 shrink-0">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-zinc-900">{value}</span>
        {subValue && <span className="text-xs text-zinc-500">{subValue}</span>}
      </div>
    </div>
  );
}

function EditableInfoItem({ icon, label, value, isEditing, onChange }: { icon: React.ReactNode, label: string, value: string, isEditing: boolean, onChange: (v: string) => void }) {
  return (
    <div className="flex items-start space-x-4">
      <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 shrink-0">
        {icon}
      </div>
      <div className="flex flex-col flex-1">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
        {isEditing ? (
          <input 
            type="text" 
            value={value} 
            onChange={(e) => onChange(e.target.value)}
            className="text-sm font-bold text-zinc-900 bg-zinc-50 border-none rounded-lg py-1 px-2 focus:ring-1 focus:ring-[#008542] outline-none w-full"
          />
        ) : (
          <span className="text-sm font-bold text-zinc-900">{value || 'Não informado'}</span>
        )}
      </div>
    </div>
  );
}
