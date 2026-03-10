// server.ts
import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import axios from "axios";
import dns from "dns";
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  console.log("DNS servers set to Google/Cloudflare");
} catch (e) {
  console.error("Could not set custom DNS servers:", e);
}
async function resolveDnsOverHttps(hostname) {
  try {
    console.log(`Resolving ${hostname} via Google DoH (8.8.8.8)...`);
    const response = await axios.get(`https://8.8.8.8/resolve?name=${hostname}&type=A`, {
      timeout: 5e3,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
      // Google DoH via IP pode precisar disso
    });
    const data = response.data;
    if (data.Answer && data.Answer.length > 0) {
      const ip = data.Answer[0].data;
      console.log(`Resolved ${hostname} to ${ip}`);
      return ip;
    }
    return null;
  } catch (e) {
    console.log(`DoH Resolution failed for ${hostname}: ${e.message}`);
    return null;
  }
}
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
        amount: parseFloat(amount.toFixed(2)),
        // Valor como número com 2 casas
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
            price: parseFloat(amount.toFixed(2))
          }
        ],
        dueDate: new Date(Date.now() + 864e5).toISOString().split("T")[0],
        // tomorrow
        callbackurl: `${process.env.APP_URL || "https://empirecred.com"}/api/sigilopay/webhook`
      };
      console.log("SigiloPay Request Payload:", JSON.stringify(payload, null, 2));
      const apiIp = await resolveDnsOverHttps("api.sigilopay.com.br");
      const targets = [
        { url: "https://api.sigilopay.com.br/gateway/pix/receive", host: "api.sigilopay.com.br" },
        { url: `https://${apiIp || "172.67.173.181"}/gateway/pix/receive`, host: "api.sigilopay.com.br" },
        { url: "https://104.21.50.180/gateway/pix/receive", host: "api.sigilopay.com.br" },
        { url: "https://app.sigilopay.com.br/api/gateway/pix/receive", host: "app.sigilopay.com.br" },
        { url: "https://sigilopay.com.br/gateway/pix/receive", host: "sigilopay.com.br" }
      ];
      let response;
      let lastError;
      let foundEndpoint = false;
      for (const target of targets) {
        if (target.url.includes("null")) continue;
        try {
          console.log(`Attempting SigiloPay API via: ${target.url} (Host: ${target.host})`);
          response = await axios.post(target.url, payload, {
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Authorization": `Bearer ${secretKey}`,
              "X-Public-Key": publicKey,
              "x-api-key": secretKey,
              "Host": target.host
            },
            timeout: 1e4,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            // Necessário para chamadas via IP
            validateStatus: () => true
            // Aceitar qualquer status para analisar
          });
          console.log(`Response from ${target.host}: Status ${response.status}, Type ${typeof response.data}`);
          if (response.data && typeof response.data !== "string" && !response.data.toString().includes("<!DOCTYPE html>")) {
            console.log(`SUCCESS with ${target.url}`);
            foundEndpoint = true;
            break;
          } else if (typeof response.data === "string") {
            console.log(`Response start: ${response.data.substring(0, 100)}`);
          }
        } catch (err) {
          lastError = err;
          console.log(`Target ${target.url} failed: ${err.message}`);
          continue;
        }
      }
      if (!foundEndpoint || !response || typeof response.data === "string" && response.data.includes("<!DOCTYPE html>")) {
        console.error("ERRO CR\xCDTICO: Falha total na conex\xE3o com SigiloPay ap\xF3s todas as tentativas de IP/DNS.");
        return res.status(500).json({
          error: "Erro de comunica\xE7\xE3o com o gateway.",
          details: lastError?.message,
          api_ip: apiIp
        });
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
