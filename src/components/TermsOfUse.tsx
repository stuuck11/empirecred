import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsOfUse() {
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
          <h1 className="text-3xl font-bold text-zinc-900">Termos de Uso</h1>
          
          <div className="space-y-4 text-zinc-600 leading-relaxed">
            <p>Ao utilizar a EmpireCred, você concorda com os seguintes termos e condições.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">1. Elegibilidade</h2>
            <p>Você deve ter pelo menos 18 anos e residir no Brasil para solicitar crédito em nossa plataforma.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">2. Simulação de Crédito</h2>
            <p>As simulações fornecidas não garantem a aprovação do crédito. A concessão está sujeita a análise detalhada.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">3. Taxas e Encargos</h2>
            <p>Todas as taxas, incluindo juros e impostos (IOF), são detalhadas antes da contratação. A taxa mensal é de 5,89%.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">4. Repagamento</h2>
            <p>O atraso no pagamento das parcelas pode resultar em multas, juros de mora e inclusão em órgãos de proteção ao crédito.</p>
            
            <h2 className="text-xl font-bold text-zinc-900">5. Responsabilidade</h2>
            <p>O usuário é responsável pela veracidade das informações fornecidas durante o cadastro e simulação.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
