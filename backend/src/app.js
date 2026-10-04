import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fileRoutes from './modules/applications/file.routes.js';

// Error handling middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// Module routes
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import serviceRoutes from './modules/services/service.routes.js';
import officeRoutes from './modules/offices/office.routes.js';
import applicationRoutes from './modules/applications/application.routes.js';
import escalationRoutes from './modules/escalations/escalation.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

const app = express();

// Security and utility middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Uploaded documents are private: only the owner or staff can download them
app.use('/uploads', fileRoutes);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'AI Legal Assistant Backend'
  });
});

// Mount Base API routes under /api/v1
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/ai`, aiRoutes);
app.use(`${API_PREFIX}/services`, serviceRoutes);
app.use(`${API_PREFIX}/offices`, officeRoutes);
app.use(`${API_PREFIX}/applications`, applicationRoutes);
app.use(`${API_PREFIX}/escalations`, escalationRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);

// Catch 404 for unhandled routes
app.use(notFoundHandler);

// Central error handler adhering to Section 62 error contract
app.use(errorHandler);

export default app;
