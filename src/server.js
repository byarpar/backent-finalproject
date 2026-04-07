require('dotenv').config();
const http = require('http');
const { app, initializeApp } = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const startServer = async () => {
  try {
    console.log('=== Server startup debug ===');
    console.log('1. About to initialize app...');

    // Initialize the application (database connections, etc.)
    await initializeApp();

    console.log('2. App initialized, creating HTTP server...');

    // Create HTTP server
    const server = http.createServer(app);

    console.log('3. About to start listening on port', PORT);

    // Start the server
    server.listen(PORT, () => {
      logger.info(`Server running in ${NODE_ENV} mode`);
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`API documentation available at http://localhost:${PORT}/health`);

      if (NODE_ENV === 'development') {
        logger.info(`Frontend URL: http://localhost:3000`);
        logger.info(`Backend URL: http://localhost:${PORT}`);
      }
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error:', error);
        process.exit(1);
      }
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close((err) => {
        if (err) {
          logger.error('Error during server shutdown:', err);
          process.exit(1);
        }

        logger.info('Server closed successfully');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.log('=== Server startup error ===');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
