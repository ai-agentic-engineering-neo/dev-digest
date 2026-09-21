import type { FastifyInstance } from 'fastify';

interface Order {
  id: string;
  total: number; // minor units (cents)
  currency: string;
}

const ORDERS: Record<string, Order> = {
  '1001': { id: '1001', total: 4200, currency: 'EUR' },
  '1002': { id: '1002', total: 1999, currency: 'USD' },
};

const OrderResponse = {
  type: 'object',
  required: ['id', 'total', 'currency'],
  properties: {
    id: { type: 'string' },
    total: { type: 'number' },
    currency: { type: 'string' },
  },
} as const;

const NotFoundResponse = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
} as const;

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/orders/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: { 200: OrderResponse, 404: NotFoundResponse },
      },
    },
    async (req, reply) => {
      const order = ORDERS[req.params.id];
      if (!order) return reply.code(404).send({ error: 'order not found' });
      return order;
    },
  );
}
