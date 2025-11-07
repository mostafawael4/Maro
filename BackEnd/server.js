require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const morgan = require('morgan');

const connectDB = require('./config/db');
const Admin = require('./models/admin');
const bcrypt = require('bcryptjs');

const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/orders');
const logsRoutes = require('./routes/logs');
const galleryRoutes = require('./routes/gallery');
const filmsRoutes = require('./routes/films');
const packagesRoutes = require('./routes/packages');

const PORT = process.env.PORT || 4000;
const DB_USER = process.env.DB_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MONGO_URI = `mongodb+srv://${DB_USER}:${DB_PASSWORD}@db1.kfzkn5b.mongodb.net/?appName=db1`;
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '.';

(async () => {
  try {
    await connectDB(MONGO_URI);

    const app = express();

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // create a write stream for requests
    const accessLogStream = fs.createWriteStream(path.join(process.env.LOG_DIR || './logs', 'access.log'), { flags: 'a' });

    // log every request to console & file
    app.use(morgan('combined', { stream: accessLogStream }));
    app.use(morgan('dev'));

    // sessions (using MongoStore)
    app.use(session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
      store: MongoStore.create({ mongoUrl: MONGO_URI })
    }));

    // serve uploaded images statically
    app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));

    // routes
    app.use('/admin', adminRoutes);
    app.use('/orders', orderRoutes);
    app.use('/logs', logsRoutes);
    app.use('/gallery', galleryRoutes);
    app.use('/films', filmsRoutes);
    app.use('/packages', packagesRoutes);

    app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
    // small health endpoint
    app.get('/', (req, res) => res.json({ ok: true, message: 'Maro backend running' }));

    // initial admin creation if ADMIN_INITIAL_PASSWORD env provided and no admin exists
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    if (initialPassword) {
      const existing = await Admin.findOne({});
      if (!existing) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(initialPassword, salt);
        await Admin.create({ username: 'admin', passwordHash });
        console.log('Initial admin created with password from ADMIN_INITIAL_PASSWORD env var. Remove this var after first run.');
      }
    }

    app.listen(PORT, () => {
      logger.info(`Server listening on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();