// functions/index.js
import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import morgan from "morgan";

import connectDB from "../config/db.js";
import Credentials from "../config/Credentials.js";
import allRoutes from "../routes/routes.js";
import roleInjector from "../middleware/roleInjector.js";

import * as functions from "firebase-functions";

// Needed to emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

let dbConnected = false;

async function ensureDBConnected() {
  if (!dbConnected) {
    try {
      await connectDB(Credentials.MONGO_URI);
      dbConnected = true;
      console.log("MongoDB connected!");
    } catch (err) {
      console.error("MongoDB connection failed:", err);
      throw err;
    }
  }
}

// CORS
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Middleware to ensure DB is connected before any request
app.use(async (req, res, next) => {
  try {
    await ensureDBConnected();
    next();
  } catch (err) {
    console.error("DB connection failed:", err);
    res.status(500).json({ ok: false, message: "Database connection failed" });
  }
});

// Body parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging
const accessLogStream = fs.createWriteStream(
  path.join(Credentials.LOG_DIR || "./logs", "access.log"),
  { flags: "a" }
);
app.use(morgan("combined", { stream: accessLogStream }));
app.use(morgan("dev"));

// Sessions (MongoStore)
app.use(
  session({
    secret: Credentials.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8,
      secure: false,
      sameSite: "none",
    },
    store: MongoStore.create({ mongoUrl: Credentials.MONGO_URI }),
  })
);

// Role injector
app.use(roleInjector);

// Routes
app.use("/", allRoutes);

// Serve uploads (if needed)
const uploadsDir = path.resolve(__dirname, Credentials.UPLOAD_DIR);
app.use("/uploads", express.static(uploadsDir));

// Health check
app.get("/", (req, res) =>
  res.json({ ok: true, message: "Maro backend running" })
);

// Export as Firebase Function
export const api = functions.https.onRequest(app);
