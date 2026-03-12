import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-bold">Voltar</span>
        </button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[32px] p-8 shadow-sm space-y-6"
        >
          <h1 className="text-3xl font-bold text-zinc-900">Política de Privacidade</h1>
          
          <div className="space-y-4 text-zinc-600 leading-relaxed">
            <p>A EmpireCred valoriza a sua privacidade. Esta política descreve como coletamos, usamos e protegemos seus dados.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">1. Coleta de Dados</h2>
            <p>Coletamos informações fornecidas por você, como nome, CPF, e-mail e dados de faturamento para análise de crédito.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">2. Uso de Dados</h2>
            <p>Seus dados são usados exclusivamente para processar solicitações de empréstimo, verificar identidade e cumprir obrigações legais.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">3. Compartilhamento</h2>
            <p>Podemos compartilhar dados com parceiros financeiros e órgãos reguladores conforme exigido por lei para a concessão de crédito.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">4. Segurança</h2>
            <p>Implementamos medidas de segurança rigorosas para proteger seus dados contra acesso não autorizado.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">5. Seus Direitos</h2>
            <p>Você tem o direito de acessar, corrigir ou excluir seus dados pessoais a qualquer momento através do nosso suporte.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
