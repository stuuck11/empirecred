import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import dns from 'dns';
import { promisify } from 'util';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  orderBy, 
  limit 
} from 'firebase/firestore';

// Inicializar Firebase
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const database = db; // Alias para compatibilidade

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
    console.log(`[${new Date().toISOString()}] Início do upload de documentos (frente/verso)...`);
    next();
  }, upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 }
  ]), (req, res) => {
    try {
      const files = req.files as any;
      
      if (!files || !files.front || !files.back) {
        console.error('Erro: Arquivos incompletos no upload de documentos');
        return res.status(400).json({ error: 'Ambos os arquivos (frente e verso) são obrigatórios.' });
      }

      console.log(`[${new Date().toISOString()}] Upload de documentos concluído: Frente=${files.front[0].filename}, Verso=${files.back[0].filename}`);
      // Retorna as URLs relativas para salvar no banco
      res.json({
        frontUrl: `/uploads/documents/${files.front[0].filename}`,
        backUrl: `/uploads/documents/${files.back[0].filename}`
      });
    } catch (error) {
      console.error('Erro no processamento do upload de documentos:', error);
      res.status(500).json({ error: 'Erro interno no servidor ao processar upload.' });
    }
  });

  // Endpoint de Upload de Vídeo de Verificação Facial
  app.post('/api/upload-verification', (req, res, next) => {
    console.log(`[${new Date().toISOString()}] Início do upload de biometria...`);
    next();
  }, upload.single('video'), (req, res) => {
    try {
      if (!req.file) {
        console.error('Erro: Nenhum arquivo recebido no upload de biometria');
        return res.status(400).json({ error: 'O vídeo de verificação é obrigatório.' });
      }

      console.log(`[${new Date().toISOString()}] Upload de biometria concluído: ${req.file.filename} (${req.file.size} bytes)`);
      res.json({
        videoUrl: `/uploads/documents/${req.file.filename}`
      });
    } catch (error) {
      console.error('Erro no processamento do upload do vídeo:', error);
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
    console.log(`[${new Date().toISOString()}] SigiloPay Proxy Request:`, JSON.stringify(req.body, null, 2));
    try {
      let { amount, method, description, userId } = req.body;
      
      if (!userId) {
        console.error('[SigiloPay Proxy] Error: userId is missing');
        return res.status(400).json({ error: 'userId é obrigatório para registrar o pagamento.' });
      }

      // REDIRECIONAMENTO TEMPORÁRIO: Boleto -> PIX
      // Como o Boleto está retornando "No acquirer found", forçamos PIX para não perder a venda.
      if (method === 'boleto') {
        console.log('[SigiloPay Proxy] Temporary Redirect: Boleto requested, forcing PIX generation.');
        method = 'pix';
      }
      const secretKey = process.env.SIGILOPAY_SECRET_KEY;
      const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;

      if (!secretKey || !publicKey) {
        console.error('[SigiloPay Proxy] SigiloPay credentials missing in environment.');
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
          document: '24788658070',
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
          internalId: `loan-${Date.now()}`,
          userId: userId,
          amount: Number(amount.toFixed(2)),
          description: description || 'Taxa de Empréstimo'
        },
        callbackurl: `${process.env.APP_URL || 'https://empirecred.com'}/api/webhooks/sigilopay`
      };

      // PIX aceita uma estrutura mais simples, mas vamos manter o padrão para ambos
      if (method === 'pix') {
        payload.description = description || 'Taxa de Empréstimo';
      }

      console.log('[SigiloPay Proxy] Request Payload:', JSON.stringify(payload, null, 2));

      // Escolhe o endpoint baseado no método (pix ou boleto)
      const hostname = 'app.sigilopay.com.br';
      const path = method === 'boleto' ? 'boleto' : 'pix';
      let url = `https://${hostname}/api/v1/gateway/${path}/receive`;
      
      console.log(`[SigiloPay Proxy] Attempting API (${method}) via: ${url}`);
      
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
          timeout: 60000
        });
      } catch (err: any) {
        console.error(`[SigiloPay Proxy] API Call Failed: ${err.message}`, err.response?.data);
        if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
          console.log(`[SigiloPay Proxy] DNS failure for ${hostname}, attempting DoH resolution...`);
          const ip = await resolveDnsOverHttps(hostname);
          if (ip) {
            url = `https://${ip}/api/v1/gateway/${path}/receive`;
            console.log(`[SigiloPay Proxy] Retrying via IP: ${url}`);
            response = await axios.post(url, payload, {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'x-public-key': publicKey,
                'x-secret-key': secretKey,
                'Host': hostname
              },
              timeout: 60000,
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
      console.log('[SigiloPay Proxy] API Response:', JSON.stringify(data, null, 2));

      // Captura o ID da transação no SigiloPay
      const externalId = data.order?.id || data.id || `ext-${Date.now()}`;

      // Salvar o pagamento no Firestore
      try {
        await addDoc(collection(db, 'payments'), {
          userId,
          amount: Number(amount.toFixed(2)),
          status: 'pending',
          method: method || 'pix',
          externalId: String(externalId),
          identifier: payload.identifier, // Salvar o identifier para busca mais robusta
          description: description || 'Taxa de Empréstimo',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log(`[SigiloPay Proxy] Payment record saved to Firestore for user ${userId}. Identifier: ${payload.identifier}`);
      } catch (fsErr) {
        console.error("[SigiloPay Proxy] Error saving payment to Firestore:", fsErr);
      }

      // Mapeamento robusto baseado no projeto de referência
      const pixData = data.pix || {};
      const orderData = data.order || {};
      
      const pixCode = pixData.code || data.pix_code || data.payload || (typeof data.payload === 'string' ? data.payload : null);
      let pixQrCode = pixData.base64 || pixData.image || pixData.qr_code || data.encodedImage;
      
      if (pixQrCode && typeof pixQrCode === 'string' && !pixQrCode.startsWith('http') && !pixQrCode.startsWith('data:')) {
        pixQrCode = `data:image/png;base64,${pixQrCode}`;
      }
      
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

      console.log('[SigiloPay Proxy] Final Response Sent to Client.');
      return res.json(finalResponse);

    } catch (error: any) {
      console.error('[SigiloPay Proxy] Fatal Error:', error.message);
      const errorMessage = error.response?.data?.message || error.message || 'Erro ao processar pagamento com SigiloPay';
      res.status(error.response?.status || 500).json({ 
        error: errorMessage,
        details: error.response?.data || error.message
      });
    }
  });

  // SigiloPay Webhook
  app.post('/api/webhooks/sigilopay', async (req, res) => {
    console.error(`[${new Date().toISOString()}] WEBHOOK RECEIVED:`, JSON.stringify(req.body, null, 2));
    
    try {
      const body = req.body;
      const transaction = body.transaction || {};
      const client = body.client || transaction.client || {};
      
      // Extração robusta de dados
      const status = body.status || transaction.status || body.event;
      const externalId = body.order_id || body.id || transaction.id;
      const identifier = body.identifier || transaction.identifier;
      const metadata = body.metadata || transaction.metadata || body.trackProps || transaction.trackProps || {};
      const webhookAmount = body.amount || transaction.amount || metadata.amount;
      const clientEmail = client.email;
      
      const statusStr = String(status).toLowerCase();

      console.log(`[Webhook] Processing externalId: ${externalId}, identifier: ${identifier}, status: ${statusStr}`);
      console.log(`[Webhook] Metadata/TrackProps:`, JSON.stringify(metadata));

      // Mapeamento de status de sucesso
      const isPaid = [
        'paid', 'approved', 'completed', 'success', 'pago', 'aprovado', 
        'transaction_paid', 'transaction_completed'
      ].includes(statusStr);

      if (isPaid) {
        console.log(`[Webhook] Payment confirmed for externalId: ${externalId}`);
        
        let userId = metadata?.userId || body.userId || transaction.userId;
        let amount = webhookAmount;
        let description = metadata?.description;

        // 1. Tentar encontrar o pagamento pelo externalId ou identifier
        if (externalId || identifier) {
          const paymentsRef = collection(db, 'payments');
          let paymentDoc = null;
          
          // Busca por externalId (ID da transação no SigiloPay)
          if (externalId) {
            const q = query(paymentsRef, where('externalId', '==', String(externalId)), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) paymentDoc = snap.docs[0];
          }
          
          // Se não achou, busca por identifier (nosso ID interno loan-...)
          if (!paymentDoc && identifier) {
            console.log(`[Webhook] Payment not found by externalId, searching by identifier: ${identifier}`);
            const q = query(paymentsRef, where('identifier', '==', String(identifier)), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) paymentDoc = snap.docs[0];
          }

          if (paymentDoc) {
            const paymentData = paymentDoc.data();
            userId = userId || paymentData.userId;
            amount = amount || paymentData.amount;
            description = description || paymentData.description;
            
            console.log(`[Webhook] Found payment record ${paymentDoc.id} for user ${userId}`);

            if (paymentData.status === 'paid') {
              console.log(`[Webhook] Payment ${paymentDoc.id} already marked as paid.`);
              return res.status(200).send('OK');
            }

            await updateDoc(paymentDoc.ref, {
              status: 'paid',
              updatedAt: new Date().toISOString()
            });
          } else {
            console.log(`[Webhook] No payment record found in Firestore for externalId ${externalId} or identifier ${identifier}`);
          }
        }

        // 2. Fallback: Se ainda não temos userId, buscar pelo e-mail do cliente
        if (!userId && clientEmail) {
          console.log(`[Webhook] Fallback: Searching user by email ${clientEmail}`);
          const usersQuery = query(collection(db, 'users'), where('email', '==', clientEmail), limit(1));
          const usersSnapshot = await getDocs(usersQuery);
          
          if (!usersSnapshot.empty) {
            userId = usersSnapshot.docs[0].id;
            console.log(`[Webhook] User found by email: ${userId}`);
          }
        }

        if (!userId) {
          console.error(`[Webhook] CRITICAL: Could not determine userId for payment ${externalId}. No record in DB and no user found with email ${clientEmail}`);
          return res.status(200).send('OK (User not found)');
        }

        console.log(`[Webhook] Final userId to update: ${userId}`);

        // Se for um depósito, atualiza o saldo do usuário
        if (description && (description.includes('Depósito') || description.includes('Saldo'))) {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const currentBalance = userDoc.data()?.balance || 0;
            const depositAmount = Number(amount) || 0;
            await updateDoc(userRef, {
              balance: currentBalance + depositAmount,
              updatedAt: new Date().toISOString()
            });
            console.log(`[Webhook] User ${userId} balance updated: +${depositAmount}`);
          }
        }
        
        // Atualizar proposta para "paid"
        console.log(`[Webhook] Searching proposals for userId: ${userId}`);
        const proposalsQuery = query(
          collection(db, 'proposals'),
          where('userId', '==', userId)
        );
        const proposalsSnapshot = await getDocs(proposalsQuery);

        if (!proposalsSnapshot.empty) {
          // Ordenar em memória para evitar a necessidade de índice composto no Firestore
          const sortedDocs = [...proposalsSnapshot.docs].sort((a, b) => {
            const dateA = new Date(a.data().createdAt || 0).getTime();
            const dateB = new Date(b.data().createdAt || 0).getTime();
            return dateB - dateA;
          });
          
          const targetProposal = sortedDocs.find(d => !['paid', 'completed'].includes(d.data().status));
          if (targetProposal) {
            await updateDoc(targetProposal.ref, {
              status: 'paid',
              updatedAt: new Date().toISOString()
            });
            console.log(`[Webhook] Proposal ${targetProposal.id} updated to paid.`);
          } else {
            console.log(`[Webhook] No active proposal found to update for user ${userId}`);
          }
        } else {
          console.log(`[Webhook] No proposals found for user ${userId}`);
        }
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error(`[Webhook] FATAL ERROR: ${error.message}`);
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
