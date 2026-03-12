import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import dns from 'dns';
import { promisify } from 'util';

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
      const { amount, method, description } = req.body;
      const secretKey = process.env.SIGILOPAY_SECRET_KEY;
      const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;

      if (!secretKey || !publicKey) {
        console.error('SigiloPay credentials missing in environment. Keys found:', { 
          hasSecret: !!secretKey, 
          hasPublic: !!publicKey 
        });
        return res.status(500).json({ error: 'Configuração do SigiloPay incompleta no servidor.' });
      }

      const payload = {
        identifier: `loan-${Date.now()}`,
        amount: Number(amount.toFixed(2)), // Em Reais (float) conforme projeto de referência
        description: description || 'Taxa de Empréstimo',
        client: {
          name: 'Roger EmpireCred',
          email: 'cliente@empirecred.com',
          phone: '17981568291',
          document: '45771930865'
        },
        metadata: {
          origin: 'EmpireCred App',
          internalId: `loan-${Date.now()}`
        },
        callbackurl: `${process.env.APP_URL || 'https://empirecred.com'}/api/webhooks/sigilopay`
      };

      console.log('SigiloPay Request Payload:', JSON.stringify(payload, null, 2));

      // Endpoint exato do projeto que já funciona
      const hostname = 'app.sigilopay.com.br';
      let url = `https://${hostname}/api/v1/gateway/pix/receive`;
      
      console.log(`Attempting SigiloPay API via: ${url}`);
      
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
            url = `https://${ip}/api/v1/gateway/pix/receive`;
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
              httpsAgent: new https.Agent({ rejectUnauthorized: false }) // Necessário para chamadas via IP
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

      // Mapeamento baseado no projeto de referência (data.pix.code e data.pix.base64)
      const pixData = data.pix || {};
      const orderData = data.order || {};
      
      const pixCode = pixData.code || data.payload;
      const pixQrCode = pixData.base64 || pixData.image || (pixCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}` : null);
      
      const finalResponse = {
        success: true,
        pixCode: pixCode,
        pixQrCode: pixQrCode,
        barcode: data.barcode || (orderData.id ? `BOL-${orderData.id}` : null),
        paymentLink: orderData.url || data.payment_url || data.checkoutUrl
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
  app.post('/api/webhooks/sigilopay', (req, res) => {
    console.log('SigiloPay Webhook Received:', JSON.stringify(req.body, null, 2));
    // Aqui você processaria o status do pagamento
    // Por enquanto apenas retornamos 200 para o SigiloPay saber que recebemos
    res.status(200).send('OK');
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
