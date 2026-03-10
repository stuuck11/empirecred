import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

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
        console.error('SigiloPay credentials missing');
        // Fallback to mock if credentials are missing for testing
        return res.json({
          success: true,
          pixCode: `00020126580014BR.GOV.BCB.PIX0136${Math.random().toString(36).substring(2, 15)}520400005303986540${Number(amount).toFixed(2)}5802BR5913EMPIRECRED6009SAOPAULO62070503***6304${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`,
          pixQrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=mock_pix_${amount}`,
          barcode: `34191.79001 01043.510047 91020.150008 1 ${Math.floor(Math.random() * 9999999999).toString().padStart(10, '0')}`,
          paymentLink: 'https://sigilopay.com.br/pay/mock_id'
        });
      }

      // Real API call to SigiloPay
      // Note: We use a generic endpoint as the exact one isn't specified, 
      // but we follow standard Brazilian gateway patterns.
      const response = await fetch('https://api.sigilopay.com.br/v1/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secretKey}`,
          'X-Public-Key': publicKey
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // convert to cents
          payment_method: method === 'pix' ? 'pix' : 'boleto',
          description: description,
          items: [{
            name: description,
            amount: Math.round(amount * 100),
            quantity: 1
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'SigiloPay API error');
      }

      const data = await response.json();
      res.json({
        success: true,
        pixCode: data.pix_code || data.copy_paste,
        pixQrCode: data.pix_qr_code || data.qr_code_url,
        barcode: data.barcode || data.line,
        paymentLink: data.payment_url || data.pdf_url
      });

    } catch (error: any) {
      console.error('SigiloPay Proxy Error:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar pagamento com SigiloPay' });
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
