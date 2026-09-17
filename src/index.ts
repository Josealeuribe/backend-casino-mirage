import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes.js";
import { ruletaRouter } from "./routes/ruleta.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { cajeroRouter } from "./routes/cajero.routes.js";
import { ubicacionesRouter } from "./routes/ubicaciones.routes.js";

const app = express();

// Detras del nginx del host y del nginx propio de este stack.
app.set("trust proxy", 2);
app.disable("x-powered-by");

const normalizarOrigen = (valor: string) => valor.trim().replace(/\/+$/, "");

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:8002")
  .split(",")
  .map(normalizarOrigen)
  .filter(Boolean);

console.log("CORS habilitado para:", allowedOrigins.join(", "));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(normalizarOrigen(origin))) {
        return callback(null, true);
      }
      console.warn(`CORS: origen rechazado -> ${origin}`);
      return callback(null, false);
    },
    // La cookie de visitante anonimo (limite de giros) puede ser cross-site
    // segun donde quede montado el front; sin esto el navegador no la manda
    // de vuelta y el conteo nunca avanzaria.
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const baseRemota = !/@(localhost|127\.0\.0\.1|db|\[::1\])[:/]/.test(process.env.DATABASE_URL ?? "");

app.get("/api/health", (_req, res) => res.json({ ok: true, baseRemota }));
app.use("/api/auth", authRouter);
app.use("/api/ruleta", ruletaRouter);
app.use("/api/admin", adminRouter);
app.use("/api/cajero", cajeroRouter);
app.use("/api/ubicaciones", ubicacionesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;

  const comoHttp = error as Error & { status?: number; type?: string };
  if (error instanceof SyntaxError && comoHttp.status === 400 && "body" in comoHttp) {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido." });
  }

  console.error(`Error no controlado en ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json({ error: "Ocurrió un error inesperado. Intenta de nuevo en un momento." });
});

process.on("unhandledRejection", (motivo) => {
  console.error("Promesa rechazada sin manejar. Cerrando para reinicio limpio:", motivo);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Excepción no capturada. Cerrando para reinicio limpio:", error);
  process.exit(1);
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`API de Centro Club Mirage escuchando en http://localhost:${port}`);
});
