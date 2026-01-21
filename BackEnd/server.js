import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import morgan from "morgan";

import connectDB from "./config/db.js";

import Credentials from "./config/Credentials.js";

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import allRoutes from "./routes/routes.js";
import roleInjector from "./middleware/roleInjector.js";

(async () => {
  try {
    await connectDB(Credentials.MONGO_URI);

    const app = express();
    app.set("trust proxy", 1); // trust first proxy


    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // Configure CORS
    app.use(
      cors({
        origin: [
          `${Credentials.SERVER_ORIGIN}`,
          `${Credentials.FRONTEND_ORIGIN}`,
        ], // your Angular app origin
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true, // if you’re using cookies or auth headers
      })
    );

    // create a write stream for requests
    const accessLogStream = fs.createWriteStream(
      path.join(Credentials.LOG_DIR || "./logs", "access.log"),
      { flags: "a" }
    );

    // log every request to console & file
    app.use(morgan("combined", { stream: accessLogStream }));
    app.use(morgan("dev"));

    // sessions (using MongoStore)
    app.use(
      session({
        secret: Credentials.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        proxy: true, // required for secure cookies behind a proxy
        cookie: {
          maxAge: 1000 * 60 * 60 * 8, // 8 hours
          secure: Credentials.NODE_ENV === "production", // only true online
          sameSite: Credentials.NODE_ENV === "production" ? "none" : "lax",
          httpOnly: true,
        },
        store: MongoStore.create({ mongoUrl: Credentials.MONGO_URI }),
      })
    );

    // Role injector - attaches session role info to API JSON responses
    app.use(roleInjector);

    // routes
    app.use("/", allRoutes);

    // serve uploaded images statically
    const uploadsDir = path.resolve(__dirname, Credentials.UPLOAD_DIR);
    app.use("/uploads", express.static(uploadsDir));

    // small health endpoint
    app.get("/", (req, res) =>
      res.json({ ok: true, message: "Maro backend running" })
    );

    app.listen(Credentials.PORT, () => {
      console.log(`Server listening on http://localhost:${Credentials.PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
})();
