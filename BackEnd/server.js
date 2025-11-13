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

const Credentials  = require('./config/Credentials.js');

const allRoutes = require('./routes/routes');

(async () => {
  try {
    await connectDB(Credentials.MONGO_URI);

    const app = express();

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // create a write stream for requests
    const accessLogStream = fs.createWriteStream(path.join(Credentials.LOG_DIR || './logs', 'access.log'), { flags: 'a' });

    // log every request to console & file
    app.use(morgan('combined', { stream: accessLogStream }));
    app.use(morgan('dev'));

    // sessions (using MongoStore)
    app.use(session({
      secret: Credentials.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
      store: MongoStore.create({ mongoUrl: Credentials.MONGO_URI })
    }));

    // routes
    app.use('/', allRoutes);
    
    // serve uploaded images statically
    const uploadsDir = path.resolve(__dirname, Credentials.UPLOAD_DIR) 
    app.use('/uploads', express.static(uploadsDir));

    // small health endpoint
    app.get('/', (req, res) => res.json({ ok: true, message: 'Maro backend running' }));

    // initial admin creation if ADMIN_INITIAL_PASSWORD env provided and no admin exists
    const initialPassword = Credentials.ADMIN_INITIAL_PASSWORD;
    if (initialPassword) {
      const existing = await Admin.findOne({});
      if (!existing) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(initialPassword, salt);
        await Admin.create({ username: 'admin', passwordHash });
        console.log('Initial admin created with password from ADMIN_INITIAL_PASSWORD env var. Remove this var after first run.');
      }
    }

    app.listen(Credentials.PORT, () => {
      logger.info(`Server listening on http://localhost:${Credentials.PORT}`);
    });

  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();