// server.ts
import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import axios from "axios";
var stderrLogStream = fs.createWriteStream(path.join(process.cwd(), "stderr.log"), { flags: "a" });
var originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.map((arg) => {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}
${arg.stack}`;
    }
    return typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg;
  }).join(" ");
  stderrLogStream.write(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${message}
`);
  originalConsoleError.apply(console, args);
};
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
      if (req.body.cpf && (file.fieldname === "video" || file.fieldname === "front" || file.fieldname === "back" || file.fieldname === "proof")) {
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
      if (!files || !files.front || !files.back) {
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
  app.post("/api/sigilopay/payment", async (req, res) => {
    try {
      const { amount, method, description } = req.body;
      const secretKey = process.env.SIGILOPAY_SECRET_KEY;
      const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;
      if (!secretKey || !publicKey) {
        console.error("SigiloPay credentials missing in environment. Keys found:", {
          hasSecret: !!secretKey,
          hasPublic: !!publicKey
        });
        return res.status(500).json({ error: "Configura\xE7\xE3o do SigiloPay incompleta no servidor." });
      }
      const response = await axios.post("https://api.sigilopay.com.br/v1/transaction", {
        amount: Math.round(amount * 100),
        // convert to cents
        payment_method: method === "pix" ? "pix" : "boleto",
        description,
        return_url: `${process.env.APP_URL || "https://empirecred.com"}/dashboard`,
        notification_url: `${process.env.APP_URL || "https://empirecred.com"}/api/sigilopay/webhook`,
        customer: {
          name: "Cliente EmpireCred",
          email: "cliente@empirecred.com",
          document: "00000000000"
        }
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secretKey}`,
          "X-Public-Key": publicKey
        },
        timeout: 3e4
        // 30 seconds timeout
      });
      const data = response.data;
      console.log("SigiloPay API Response:", JSON.stringify(data, null, 2));
      const resultData = data.data || data;
      const pixCode = resultData.pix_code || resultData.copy_paste || resultData.pix_copy_paste || resultData.pix_payload || resultData.payload;
      const pixQrCode = resultData.pix_qr_code || resultData.qr_code_url || resultData.pix_qr_code_url || resultData.qr_code || (pixCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}` : null);
      res.json({
        success: true,
        pixCode,
        pixQrCode,
        barcode: resultData.barcode || resultData.line || resultData.digitable_line || resultData.boleto_line || resultData.linha_digitavel,
        paymentLink: resultData.payment_url || resultData.pdf_url || resultData.boleto_url || resultData.url || resultData.checkout_url
      });
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || "Erro ao processar pagamento com SigiloPay";
      const errorDetails = error.response?.data || error.message;
      console.error("SigiloPay Proxy Error:", errorDetails);
      res.status(error.response?.status || 500).json({
        error: errorMessage,
        details: errorDetails
      });
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
