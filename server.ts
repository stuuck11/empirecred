import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

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
      // Gera nome único: timestamp-nomeoriginal
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB
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
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files.front || !files.back) {
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

  // Catch-all for /api routes to prevent falling through to Vite SPA fallback
  app.all('/api/*', (req, res) => {
    console.log(`404 API: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
  });

  // Error handler for Multer and other errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server Error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Erro interno no servidor'
    });
  });

  // Integração com Vite (Middleware)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Em produção, serve os arquivos estáticos da pasta dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Fallback para SPA: envia o index.html para qualquer rota não encontrada
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Uploads salvos em: ${path.join(process.cwd(), 'uploads/documents')}`);
  });
}

startServer();
