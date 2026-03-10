import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

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
  stderrLogStream.write(`[${new Date().toISOString()}] ERROR: ${message}\n`);
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
        amount: parseFloat(amount.toFixed(2)), // amount in BRL as number
        client: {
          name: 'Cliente EmpireCred',
          email: 'cliente@empirecred.com',
          phone: '11999999999',
          document: '000.000.000-00'
        },
        products: [
          {
            id: 'loan_fee',
            name: description || 'Taxa de Empréstimo',
            quantity: 1,
            price: parseFloat(amount.toFixed(2))
          }
        ],
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
        callbackUrl: `${process.env.APP_URL || 'https://empirecred.com'}/api/sigilopay/webhook`
      };

      console.log('SigiloPay Request Payload:', JSON.stringify(payload, null, 2));

      // Real API call to SigiloPay using axios for better stability in Node environments
      // Based on the screenshot: POST /gateway/pix/receive
      const response = await axios.post('https://sigilopay.com.br/gateway/pix/receive', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secretKey}`,
          'X-Public-Key': publicKey,
          'x-api-key': secretKey // Redundant header for some gateway versions
        },
        timeout: 30000 // 30 seconds timeout
      });

      const data = response.data;
      console.log('SigiloPay API Response Status:', response.status);
      console.log('SigiloPay API Response Keys:', Object.keys(data));
      console.log('SigiloPay API Response:', JSON.stringify(data, null, 2));

      // Mapeamento de campos extremamente resiliente baseado no screenshot e variações comuns
      const resultData = data.data && typeof data.data === 'object' ? data.data : data;
      const pixData = resultData.pix || data.pix || {};
      const orderData = resultData.order || data.order || {};
      
      // Tenta encontrar o código PIX em múltiplos locais possíveis
      const pixCode = pixData.code || 
                      pixData.payload || 
                      resultData.pix_code || 
                      data.pix_code || 
                      resultData.copy_paste || 
                      data.copy_paste || 
                      resultData.payload || 
                      data.payload;

      // Tenta encontrar o QR Code ou Link de Pagamento
      const pixQrCode = pixData.image || 
                        pixData.qr_code_url || 
                        orderData.url || 
                        resultData.qr_code || 
                        data.qr_code || 
                        pixData.base64 || 
                        (pixCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}` : null);
      
      const finalResponse = {
        success: true,
        pixCode: pixCode,
        pixQrCode: pixQrCode,
        barcode: resultData.barcode || resultData.line || resultData.digitable_line || data.barcode,
        paymentLink: orderData.url || resultData.payment_url || resultData.pdf_url || data.payment_url
      };

      console.log('Final Proxy Response:', JSON.stringify(finalResponse, null, 2));
      res.json(finalResponse);

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

  // Catch-all for /api routes to prevent falling through to Vite SPA fallback
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
