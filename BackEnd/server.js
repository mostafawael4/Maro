import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import morgan from "morgan";
import { createServer } from "http";

import connectDB from "./config/db.js";

import Credentials from "./config/Credentials.js";

import allRoutes from "./routes/routes.js";
import roleInjector from "./middleware/roleInjector.js";
import { initializeWebSocketServer } from "./config/ws-server.js";
import websocketService from "./services/websocket.service.js";

(async () => {
  try {
    await connectDB(Credentials.MONGO_URI);

    const app = express();

    // Trust all proxies - essential for secure cookies on Railway
    app.set('trust proxy', true);

    console.log(`[Backend] Environment: ${Credentials.NODE_ENV}, isProduction: ${Credentials.isProduction}`);

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // Configure CORS
    const allowedOrigins = [
      `${Credentials.SERVER_ORIGIN}`,
      `${Credentials.FRONTEND_ORIGIN}`,
      'https://maroweddings.com',
      'https://www.maroweddings.com',
      'http://localhost:4200',
      'http://localhost:4000',
      'http://localhost:3000'
    ].filter(origin => origin && origin !== 'undefined');

    app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or curl)
          if (!origin) return callback(null, true);

          if (allowedOrigins.indexOf(origin) !== -1 || Credentials.NODE_ENV !== 'production') {
            callback(null, true);
          } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      })
    );

    // create a write stream for requests
    let accessLogStream;
    if (Credentials.NODE_ENV === "development") {
      accessLogStream = fs.createWriteStream(
        path.join(Credentials.LOG_DIR || "./logs", "access.log"),
        { flags: "a" }
      );
    }

    // log every request to console & file
    app.use(morgan("combined", { stream: accessLogStream || process.stdout }));
    app.use(morgan("dev", { stream: process.stdout }));

    // sessions (using MongoStore)
    const sessionMiddleware = session({
      name: 'maro.sid',
      secret: Credentials.SESSION_SECRET,
      resave: true,
      saveUninitialized: false,
      rolling: true,
      proxy: true, // required for secure cookies behind a proxy
      cookie: {
        maxAge: 1000 * 60 * 60 * 8, // 8 hours
        secure: Credentials.isProduction, // only true in production/railway
        sameSite: Credentials.isProduction ? "none" : "lax",
        httpOnly: true,
      },
      store: MongoStore.create({ mongoUrl: Credentials.MONGO_URI }),
    });

    app.use(sessionMiddleware);

    // Role injector - attaches session role info to API JSON responses
    app.use(roleInjector);

    app.use((req, res, next) => {
      const start = process.hrtime(); // high-res timer

      res.on("finish", () => {
        const diff = process.hrtime(start);
        const ms = diff[0] * 1e3 + diff[1] / 1e6;
        console.log(`${req.method} ${req.originalUrl} took ${ms.toFixed(2)}ms`);
      });

      next();
    });

    // routes
    app.use("/", allRoutes);

    // serve uploaded images statically
    // disabled for since v1.4.0 (using B2 bucket with client side upload)
    //const uploadsDir = path.resolve(__dirname, Credentials.UPLOAD_DIR);
    //app.use("/uploads", express.static(uploadsDir));

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize WebSocket server
    const wss = initializeWebSocketServer(httpServer, sessionMiddleware);
    websocketService.setWebSocketServer(wss);

    httpServer.listen(Credentials.PORT, () => {
      if (Credentials.NODE_ENV === "development") {
        console.log(`Server listening on http://localhost:${Credentials.PORT}`);
        console.log(`WebSocket server is running on ws://localhost:${Credentials.PORT}/ws`);
      }

      console.log(`Server is running in ${Credentials.NODE_ENV} mode with edit version 1.9.0`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
})();
