const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const logger = require("./utils/logger");
const morgan = require("morgan");

const connectDB = require("./config/db");

const Credentials = require("./config/Credentials.js");

const allRoutes = require("./routes/routes");

(async () => {
  try {
    await connectDB(Credentials.MONGO_URI);

    const app = express();

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
        cookie: {
          maxAge: 1000 * 60 * 60 * 8, // 8 hours
          secure: Credentials.NODE_ENV === "production", // only true online
          sameSite: Credentials.NODE_ENV === "production" ? "none" : "lax",
        },
        store: MongoStore.create({ mongoUrl: Credentials.MONGO_URI }),
      })
    );

    // Role injector - attaches session role info to API JSON responses
    app.use(require("./middleware/roleInjector"));

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
      logger.info(`Server listening on http://localhost:${Credentials.PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
})();
