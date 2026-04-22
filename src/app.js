const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const passport = require('passport');
const session = require('express-session');

const logger = require('./utils/logger');
const { db } = require('./config/database');
const formatError = (error) => ({ message: error.message || 'An error occurred', code: error.code || 'UNKNOWN_ERROR' });
const { errorHandler, notFoundHandler } = require('./middlewares');

// Initialize passport configuration
require('./config/passport');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const discussionRoutes = require('./routes/discussions');
const answerRoutes = require('./routes/answers');
const userRoutes = require('./routes/users');

// Create Express application
const app = express();

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware (required for passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Request logging middleware (structured format)
app.use(logger.requestLogger);

// Logging middleware for development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'DevForum API',
    data: {
      name: 'DevForum Backend',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        auth: '/api/auth',
        users: '/api/users',
        discussions: '/api/discussions',
        answers: '/api/answers',
        admin: '/api/admin'
      }
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/answers', answerRoutes);
app.use('/api/users', userRoutes);

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build/index.html'));
  });
}

// 404 handler for API routes
app.use('/api/*', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Initialize application
const initializeApp = async () => {
  try {
    logger.info('Initializing application...');
    logger.info('Starting database initialization...');

    // Initialize database connection
    await db.initialize();
    logger.info('Database connection established');

    logger.info('Application initialized successfully');
    return true;
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    logger.error('Error details:', error.stack);
    throw error;
  }
};

module.exports = { app, initializeApp };
