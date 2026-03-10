// server.ts
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
async function startServer() {
  const app = express();
  const PORT = 3e3;
  const uploadDir = path.join(process.cwd(), "uploads/documents");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      if (req.body.cpf && (file.fieldname === "video" || file.fieldname === "front" || file.fieldname === "back")) {
        const cpf = req.body.cpf.replace(/\D/g, "");
        const prefix = file.fieldname;
        cb(null, `${prefix}-${cpf}${path.extname(file.originalname) || (file.fieldname === "video" ? ".mp4" : ".jpg")}`);
      } else {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
      }
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }
    // Limite de 50MB para vídeos longos
  });
  app.use(express.json());
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app.post("/api/upload-document", (req, res, next) => {
    console.log("POST /api/upload-document");
    next();
  }, upload.fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 }
  ]), (req, res) => {
    try {
      const files = req.files;
      if (!files.front || !files.back) {
        return res.status(400).json({ error: "Ambos os arquivos (frente e verso) s\xE3o obrigat\xF3rios." });
      }
      res.json({
        frontUrl: `/uploads/documents/${files.front[0].filename}`,
        backUrl: `/uploads/documents/${files.back[0].filename}`
      });
    } catch (error) {
      console.error("Erro no upload:", error);
      res.status(500).json({ error: "Erro interno no servidor ao processar upload." });
    }
  });
  app.post("/api/upload-verification", (req, res, next) => {
    console.log("POST /api/upload-verification");
    next();
  }, upload.single("video"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "O v\xEDdeo de verifica\xE7\xE3o \xE9 obrigat\xF3rio." });
      }
      res.json({
        videoUrl: `/uploads/documents/${req.file.filename}`
      });
    } catch (error) {
      console.error("Erro no upload do v\xEDdeo:", error);
      res.status(500).json({ error: "Erro interno no servidor ao processar upload do v\xEDdeo." });
    }
  });
  app.post("/api/upload-proof", (req, res, next) => {
    console.log("POST /api/upload-proof");
    next();
  }, upload.single("proof"), (req, res) => {
    try {
      if (!req.file) {
        console.log("Upload proof: No file");
        return res.status(400).json({ error: "O comprovante \xE9 obrigat\xF3rio." });
      }
      console.log("Upload proof: Success", req.file.filename);
      res.json({
        proofUrl: `/uploads/documents/${req.file.filename}`
      });
    } catch (error) {
      console.error("Erro no upload do comprovante:", error);
      res.status(500).json({ error: "Erro interno no servidor ao processar upload do comprovante." });
    }
  });
  app.all("/api/*", (req, res) => {
    console.log(`404 API: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
  });
  app.use((err, req, res, next) => {
    console.error("Server Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Erro interno no servidor"
    });
  });
  if (process.env.NODE_ENV === "development") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), "dist")) ? path.join(process.cwd(), "dist") : process.cwd();
    console.log(`Servindo arquivos est\xE1ticos de: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("index.html n\xE3o encontrado no servidor. Verifique o build.");
      }
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Uploads salvos em: ${path.join(process.cwd(), "uploads/documents")}`);
  });
}
startServer();
