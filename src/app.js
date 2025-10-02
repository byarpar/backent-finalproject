const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');

const logger = require('./utils/logger');
const { db } = require('./config/database');
const { formatError } = require('./utils/helpers');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const wordRoutes = require('./routes/words');
const searchRoutes = require('./routes/search');
const etymologyRoutes = require('./routes/etymology');
const adminRoutes = require('./routes/admin');
const discussionRoutes = require('./routes/discussions');

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      message: 'Too many requests',
      details: 'Please try again later'
    }
  }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/words', wordRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/etymology', etymologyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/discussions', discussionRoutes);

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

    // Initialize database connection
    await db.initialize();
    logger.info('Database connection established');

    logger.info('Application initialized successfully');
    return true;
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    throw error;
  }
};

module.exports = { app, initializeApp };
