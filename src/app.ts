import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import path from 'path';

import { authMiddleware } from './middleware/auth.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { authRouter } from './routes/auth.router';
import { ordersRouter } from './routes/orders.router';
import { productsRouter } from './routes/products.router';
import { promocodesRouter } from './routes/promo-codes.router';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(loggingMiddleware);
  app.use(authMiddleware);

  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.resolve(__dirname, '../openapi/spec.yaml'),
      validateRequests: true,
      validateResponses: false,
      validateSecurity: false,
    })
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/auth', authRouter);
  app.use('/products', productsRouter);
  app.use('/orders', ordersRouter);
  app.use('/promo-codes', promocodesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error_code: 'VALIDATION_ERROR', message: 'Route not found', details: null });
  });

  app.use(errorMiddleware);

  return app;
}
