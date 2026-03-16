import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

function getAllowedOrigins(): string[] {
  const allowedOrigins = new Set<string>();

  const candidates = [
    process.env.APP_BASE_URL,
    process.env.CORS_ALLOWED_ORIGINS,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    for (const entry of candidate.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;

      try {
        allowedOrigins.add(new URL(trimmed).origin);
      } catch {
        // Ignore malformed values so boot does not fail on one bad entry.
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://localhost:5173");
  }

  return Array.from(allowedOrigins);
}

const app: Express = express();

const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export default app;
