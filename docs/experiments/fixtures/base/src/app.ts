import Fastify from 'fastify';
import { ordersRoutes } from './routes/orders.js';

export function buildApp() {
  const app = Fastify();
  app.register(ordersRoutes, { prefix: '/v1' });
  return app;
}
