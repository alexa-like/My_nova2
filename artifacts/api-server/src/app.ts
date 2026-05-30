import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { getBot } from "./bot/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Restrict CORS to trusted origins only
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  process.env.RENDER_EXTERNAL_URL,
  process.env.SERVER_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin (no origin header) and Replit preview domains
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || origin.includes(".replit.") || origin.includes(".repl.co")) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve admin dashboard static files
const dashboardDist = path.resolve(__dirname, "../../admin-dashboard/dist/public");
app.use(express.static(dashboardDist));

// Telegram webhook (production mode — active when WEBHOOK_URL is set)
app.post("/api/bot/webhook", (req, res) => {
  const bot = getBot();
  if (bot) {
    (bot as any).processUpdate(req.body).catch(() => {});
  }
  res.sendStatus(200);
});

// Fallback: serve index.html for all non-API routes (SPA routing)
app.get("*", (_req, res) => {
  res.sendFile(path.join(dashboardDist, "index.html"));
});

export default app;
