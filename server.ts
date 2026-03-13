import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import dns from 'dns';
import { promisify } from 'util';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializar Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const app = getApps().length === 0 
  ? initializeApp({ projectId: firebaseConfig.projectId })
  : getApp();

const firestoreDbId = firebaseConfig.firestoreDatabaseId || '(default)';
// Se houver um databaseId específico no config, usamos ele
const database = getFirestore(app, firestoreDbId);
const db = database; // Alias para compatibilidade se necessário

const resolve4 = promisify(dns.resolve4);

// Tentar forçar DNS do Google para contornar bloqueios da Hostinger
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  console.log('DNS servers set to Google/Cloudflare');
} catch (e) {
  console.error('Could not set custom DNS servers:', e);
}

// Função para resolver DNS via HTTPS (DoH) usando IP direto do Google para evitar falhas de DNS local
async function resolveDnsOverHttps(hostname: string): Promise<string | null> {
  try {
    console.log(`Resolving ${hostname} via Google DoH (8.8.8.8)...`);
    // Usamos o IP 8.8.8.8 diretamente para não depender do DNS local para resolver 'dns.google'
    const response = await axios.get(`https://8.8.8.8/resolve?name=${hostname}&type=A`, { 
      timeout: 5000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }) 
    });
    const data = response.data;
    if (data.Answer && data.Answer.length > 0) {
      const ip = data.Answer[0].data;
      console.log(`Resolved ${hostname} to ${ip}`);
      return ip;
    }
    return null;
  } catch (e: any) {
    console.log(`DoH Resolution failed for ${hostname}: ${e.message}`);
    // Fallback para DNS local caso o DoH falhe
    try {
      const ips = await resolve4(hostname);
      return ips[0] || null;
    } catch (dnsErr) {
      return null;
    }
  }
}

// Redirecionar logs de erro para stderr.log
const stderrLogStream = fs.createWriteStream(path.join(process.cwd(), 'stderr.log'), { flags: 'a' });
const stdoutLogStream = fs.createWriteStream(path.join(process.cwd(), 'stdout.log'), { flags: 'a' });

const originalConsoleError = console.error;
const originalConsoleLog = console.log;

console.error = (...args) => {
  const message = args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}\n${arg.stack}`;
    }
    return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg;
  }).join(' ');
  const logLine = `[${new Date().toISOString()}] ERROR: ${message}\n`;
  stderrLogStream.write(logLine);
  stdoutLogStream.write(logLine); // Também loga erro no stdout para facilitar
  originalConsoleError.apply(console, args);
};

console.log = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
  stdoutLogStream.write(`[${new Date().toISOString()}] LOG: ${message}\n`);
  originalConsoleLog.apply(console, args);
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  const uploadDir = path.join(process.cwd(), 'uploads/documents');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configuração de armazenamento do Multer
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Se tiver CPF no corpo da requisição, usa o CPF no nome
      if (req.body.cpf && (file.fieldname === 'video' || file.fieldname === 'front' || file.fieldname === 'back' || file.fieldname === 'proof')) {
        const cpf = req.body.cpf.replace(/\D/g, '');
        const prefix = file.fieldname;
        cb(null, `${prefix}-${cpf}${path.extname(file.originalname) || (file.fieldname === 'video' ? '.mp4' : '.jpg')}`);
      } else {
        // Gera nome único padrão para outros arquivos
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
      }
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Limite de 50MB para vídeos longos
  });

  app.use(express.json());

  // Servir arquivos estáticos da pasta uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Endpoint de Upload de Documentos
  app.post('/api/upload-document', (req, res, next) => {
    console.log('POST /api/upload-document');
    next();
  }, upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 }
  ]), (req, res) => {
    try {
      const files = req.files as any;
      
      if (!files || !files.front || !files.back) {
        return res.status(400).json({ error: 'Ambos os arquivos (frente e verso) são obrigatórios.' });
      }

      // Retorna as URLs relativas para salvar no banco
      res.json({
        frontUrl: `/uploads/documents/${files.front[0].filename}`,
        backUrl: `/uploads/documents/${files.back[0].filename}`
      });
    } catch (error) {
      console.error('Erro no upload:', error);
      res.status(500).json({ error: 'Erro interno no servidor ao processar upload.' });
    }
  });

  // Endpoint de Upload de Vídeo de Verificação Facial
  app.post('/api/upload-verification', (req, res, next) => {
    console.log('POST /api/upload-verification');
    next();
  }, upload.single('video'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'O vídeo de verificação é obrigatório.' });
      }

      res.json({
        videoUrl: `/uploads/documents/${req.file.filename}`
      });
    } catch (error) {
      console.error('Erro no upload do vídeo:', error);
      res.status(500).json({ error: 'Erro interno no servidor ao processar upload do vídeo.' });
    }
  });

  // Endpoint de Upload de Comprovante de Renda
  app.post('/api/upload-proof', (req, res, next) => {
    console.log('POST /api/upload-proof');
    next();
  }, upload.single('proof'), (req, res) => {
    try {
      if (!req.file) {
        console.log('Upload proof: No file');
        return res.status(400).json({ error: 'O comprovante é obrigatório.' });
      }

      console.log('Upload proof: Success', req.file.filename);
      res.json({
        proofUrl: `/uploads/documents/${req.file.filename}`
      });
    } catch (error) {
      console.error('Erro no upload do comprovante:', error);
      res.status(500).json({ error: 'Erro interno no servidor ao processar upload do comprovante.' });
    }
  });

  // SigiloPay API Proxy
  app.post('/api/sigilopay/payment', async (req, res) => {
    try {
      let { amount, method, description, userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'userId é obrigatório para registrar o pagamento.' });
      }

      // REDIRECIONAMENTO TEMPORÁRIO: Boleto -> PIX
      // Como o Boleto está retornando "No acquirer found", forçamos PIX para não perder a venda.
      if (method === 'boleto') {
        console.log('Temporary Redirect: Boleto requested, forcing PIX generation.');
        method = 'pix';
      }
      const secretKey = process.env.SIGILOPAY_SECRET_KEY;
      const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;

      if (!secretKey || !publicKey) {
        console.error('SigiloPay credentials missing in environment. Keys found:', { 
          hasSecret: !!secretKey, 
          hasPublic: !!publicKey 
        });
        return res.status(500).json({ error: 'Configuração do SigiloPay incompleta no servidor.' });
      }

      const payload: any = {
        identifier: `loan-${Date.now()}`,
        amount: Number(amount.toFixed(2)),
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 dias de vencimento
        client: {
          name: 'Roger EmpireCred',
          email: 'mjpelma.cardoso75@gmail.com',
          phone: '17981568291',
          document: '45771930865',
          address: {
            country: 'BR',
            zipCode: '01310-100',
            state: 'SP',
            city: 'São Paulo',
            neighborhood: 'Bela Vista',
            street: 'Avenida Paulista',
            number: '1000',
            complement: ''
          }
        },
        products: [
          {
            id: 'tax-001',
            name: description || 'Taxa de Antecipação',
            quantity: 1,
            price: Number(amount.toFixed(2))
          }
        ],
        metadata: {
          origin: 'EmpireCred App',
          internalId: `loan-${Date.now()}`
        },
        callbackurl: `${process.env.APP_URL || 'https://empirecred.com'}/api/webhooks/sigilopay`
      };

      // PIX aceita uma estrutura mais simples, mas vamos manter o padrão para ambos
      if (method === 'pix') {
        // Algumas versões da API de PIX preferem description na raiz
        payload.description = description || 'Taxa de Empréstimo';
      }

      console.log('SigiloPay Request Payload:', JSON.stringify(payload, null, 2));

      // Escolhe o endpoint baseado no método (pix ou boleto)
      const hostname = 'app.sigilopay.com.br';
      const path = method === 'boleto' ? 'boleto' : 'pix';
      let url = `https://${hostname}/api/v1/gateway/${path}/receive`;
      
      console.log(`Attempting SigiloPay API (${method}) via: ${url}`);
      
      let response;
      try {
        response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'x-public-key': publicKey,
            'x-secret-key': secretKey
          },
          timeout: 20000
        });
      } catch (err: any) {
        if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
          console.log(`DNS failure for ${hostname}, attempting DoH resolution...`);
          const ip = await resolveDnsOverHttps(hostname);
          if (ip) {
            url = `https://${ip}/api/v1/gateway/${path}/receive`;
            console.log(`Retrying via IP: ${url}`);
            response = await axios.post(url, payload, {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'x-public-key': publicKey,
                'x-secret-key': secretKey,
                'Host': hostname
              },
              timeout: 20000,
              httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      const data = response.data;
      console.log('SigiloPay API Response:', JSON.stringify(data, null, 2));

      // Captura o ID da transação no SigiloPay (ajuste conforme a resposta real da API)
      const externalId = data.order?.id || data.id || `ext-${Date.now()}`;

      // Salvar o pagamento no Firestore
      const paymentRef = await database.collection('payments').add({
        userId,
        amount: Number(amount.toFixed(2)),
        status: 'pending',
        method: method || 'pix',
        externalId: String(externalId),
        description: description || 'Taxa de Empréstimo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Mapeamento robusto baseado no projeto de referência
      const pixData = data.pix || {};
      const orderData = data.order || {};
      
      // Captura o código copia e cola
      const pixCode = pixData.code || data.pix_code || data.payload || (typeof data.payload === 'string' ? data.payload : null);
      
      // Captura a imagem do QR Code (base64 ou URL)
      let pixQrCode = pixData.base64 || pixData.image || pixData.qr_code || data.encodedImage;
      
      // CORREÇÃO: Se for base64 puro, adiciona o prefixo de imagem
      if (pixQrCode && typeof pixQrCode === 'string' && !pixQrCode.startsWith('http') && !pixQrCode.startsWith('data:')) {
        pixQrCode = `data:image/png;base64,${pixQrCode}`;
      }
      
      // Se não vier imagem mas tiver o código, gera um QR Code via API secundária para garantir
      if (!pixQrCode && pixCode) {
        pixQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`;
      }
      
      const finalResponse = {
        success: true,
        pixCode: pixCode,
        pixQrCode: pixQrCode,
        amount: payload.amount,
        barcode: data.barcode || data.digitableLine || (orderData.id ? `BOL-${orderData.id}` : null),
        paymentLink: data.url || orderData.url || data.payment_url || data.checkoutUrl
      };

      console.log('Final Proxy Response:', JSON.stringify(finalResponse, null, 2));
      return res.json(finalResponse);

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Erro ao processar pagamento com SigiloPay';
      const errorDetails = error.response?.data || error.message;
      console.error('SigiloPay Proxy Error:', errorDetails);
      res.status(error.response?.status || 500).json({ 
        error: errorMessage,
        details: errorDetails
      });
    }
  });

  // SigiloPay Webhook
  app.post('/api/webhooks/sigilopay', async (req, res) => {
    console.log('SigiloPay Webhook Received:', JSON.stringify(req.body, null, 2));
    
    try {
      const { status, order_id, id } = req.body;
      const externalId = order_id || id;

      // Se o status for "paid", "approved" ou similar (depende da API do SigiloPay)
      const isPaid = ['paid', 'approved', 'completed', 'success'].includes(String(status).toLowerCase());

      if (isPaid && externalId) {
        console.log(`Payment confirmed for externalId: ${externalId}`);
        
        // Buscar o pagamento no Firestore pelo externalId
        const paymentsSnapshot = await database.collection('payments')
          .where('externalId', '==', String(externalId))
          .limit(1)
          .get();

        if (!paymentsSnapshot.empty) {
          const paymentDoc = paymentsSnapshot.docs[0];
          const paymentData = paymentDoc.data();

          // Atualizar status do pagamento
          await paymentDoc.ref.update({
            status: 'paid',
            updatedAt: new Date().toISOString()
          });

          console.log(`Payment document ${paymentDoc.id} updated to paid.`);

          // Se o pagamento for referente a uma proposta de empréstimo específica
          // podemos tentar identificar e atualizar a proposta também
          if (paymentData.description && paymentData.description.includes('loan-')) {
            const proposalId = paymentData.description.split('loan-')[1];
            // ... lógica adicional se necessário
          }
          
          // Se for um depósito, atualiza o saldo do usuário
          if (paymentData.description && paymentData.description.includes('Depósito em conta')) {
            const userRef = database.collection('users').doc(paymentData.userId);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
              const currentBalance = userDoc.data()?.balance || 0;
              await userRef.update({
                balance: currentBalance + paymentData.amount,
                updatedAt: new Date().toISOString()
              });
              console.log(`User ${paymentData.userId} balance updated: +${paymentData.amount}`);
            }
          }
          const proposalsSnapshot = await database.collection('proposals')
            .where('userId', '==', paymentData.userId)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

          if (!proposalsSnapshot.empty) {
            await proposalsSnapshot.docs[0].ref.update({
              status: 'paid',
              updatedAt: new Date().toISOString()
            });
            console.log(`Proposal ${proposalsSnapshot.docs[0].id} updated to paid.`);
          }
        } else {
          console.log(`No payment found in Firestore for externalId: ${externalId}`);
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook Error:', error);
      res.status(500).send('Internal Error');
    }
  });

  // Catch-all for /api routes
  app.all('/api/*', (req, res) => {
    console.log(`404 API: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
  });

  // Error handler for Multer and other errors
  app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Erro interno no servidor'
    });
  });

  // Integração com Vite (Middleware)
  if (process.env.NODE_ENV === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Em produção, serve os arquivos estáticos
    // Tenta encontrar a pasta 'dist', se não existir usa a raiz (caso o usuário tenha upado o conteúdo de dist direto)
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist')) 
      ? path.join(process.cwd(), 'dist') 
      : process.cwd();
      
    console.log(`Servindo arquivos estáticos de: ${distPath}`);
    app.use(express.static(distPath));
    
    // Fallback para SPA: envia o index.html para qualquer rota não encontrada
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('index.html não encontrado no servidor. Verifique o build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Uploads salvos em: ${path.join(process.cwd(), 'uploads/documents')}`);
  });
}

startServer();
