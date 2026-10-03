import app from './app.js';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { logger } from './utils/logger.js';

const startServer = async () => {
  try {
    // Attempt database connection
    await connectDb();

    const server = app.listen(env.PORT, () => {
      logger.info(`====================================================`);
      logger.info(`🚀 AI Legal Assistant Backend Server Started`);
      logger.info(`📡 Port: ${env.PORT}`);
      logger.info(`🌍 Base URL: ${env.BASE_URL}/api/v1`);
      logger.info(`⚙️  Environment: ${env.NODE_ENV}`);
      logger.info(`====================================================`);
    });

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
