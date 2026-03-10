// server.ts
import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import axios from "axios";
var stderrLogStream = fs.createWriteStream(path.join(process.cwd(), "stderr.log"), { flags: "a" });
var stdoutLogStream = fs.createWriteStream(path.join(process.cwd(), "stdout.log"), { flags: "a" });
var originalConsoleError = console.error;
var originalConsoleLog = console.log;
console.error = (...args) => {
  const message = args.map((arg) => {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}
${arg.stack}`;
    }
    return typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg;
  }).join(" ");
  const logLine = `[${(/* @__PURE__ */ new Date()).toISOString()}] ERROR: ${message}
`;
  stderrLogStream.write(logLine);
  stdoutLogStream.write(logLine);
  originalConsoleError.apply(console, args);
};
console.log = (...args) => {
  const message = args.map((arg) => typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg).join(" ");
  stdoutLogStream.write(`[${(/* @__PURE__ */ new Date()).toISOString()}] LOG: ${message}
`);
  originalConsoleLog.apply(console, args);
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
      const payload = {
        identifier: `loan-${Date.now()}`,
        amount: amount.toFixed(2),
        // Enviar como string "XX.XX" para evitar problemas de precisão/tipo
        client: {
          name: "Cliente EmpireCred",
          email: "cliente@empirecred.com",
          phone: "11999999999",
          document: "000.000.000-00"
        },
        products: [
          {
            id: "loan_fee",
            name: description || "Taxa de Empr\xE9stimo",
            quantity: 1,
            price: amount.toFixed(2)
          }
        ],
        dueDate: new Date(Date.now() + 864e5).toISOString().split("T")[0],
        // tomorrow
        callbackurl: `${process.env.APP_URL || "https://empirecred.com"}/api/sigilopay/webhook`
      };
      console.log("SigiloPay Request Payload:", JSON.stringify(payload, null, 2));
      const endpoints = [
        "https://app.sigilopay.com.br/api/gateway/pix/receive",
        "https://api.sigilopay.com.br/gateway/pix/receive",
        "https://sigilopay.com.br/api/gateway/pix/receive"
      ];
      let response;
      let lastError;
      for (const url of endpoints) {
        try {
          console.log(`Attempting SigiloPay API via: ${url}`);
          response = await axios.post(url, payload, {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${secretKey}`,
              "X-Public-Key": publicKey,
              "x-api-key": secretKey
            },
            timeout: 1e4
          });
          if (response.data && (typeof response.data !== "string" || !response.data.includes("<!DOCTYPE html>"))) {
            console.log(`Success with endpoint: ${url}`);
            break;
          } else {
            console.log(`Endpoint ${url} returned HTML/Invalid data. Trying next...`);
          }
        } catch (err) {
          lastError = err;
          console.log(`Endpoint ${url} failed: ${err.message}`);
          continue;
        }
      }
      if (!response || typeof response.data === "string" && response.data.includes("<!DOCTYPE html>")) {
        console.error("ERRO CR\xCDTICO: Nenhum endpoint da SigiloPay retornou JSON v\xE1lido.", {
          lastError: lastError?.message,
          status: response?.status
        });
        return res.status(500).json({ error: "N\xE3o foi poss\xEDvel conectar ao gateway de pagamento. Verifique os logs." });
      }
      const data = response.data;
      console.log("SigiloPay API Response:", JSON.stringify(data, null, 2));
      const pixData = data.pix || {};
      const orderData = data.order || {};
      const pixCode = pixData.code || data.pix_code || data.payload;
      const pixQrCode = pixData.image || pixData.qr_code || (pixCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}` : null);
      const finalResponse = {
        success: true,
        pixCode,
        pixQrCode,
        barcode: data.barcode || (orderData.id ? `BOL-${orderData.id}` : null),
        paymentLink: orderData.url || data.payment_url
      };
      console.log("Final Proxy Response:", JSON.stringify(finalResponse, null, 2));
      res.json(finalResponse);
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
