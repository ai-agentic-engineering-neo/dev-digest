import { ok, err, Result } from '../lib/result';

export interface OrderRecord {
  id: string;
  status: 'pending' | 'paid' | 'refunded';
  totalCents: number;
}

export interface OrderError {
  code: 'NOT_FOUND' | 'ALREADY_PAID';
  message: string;
}

const orders = new Map<string, OrderRecord>();

export function getOrder(id: string): Result<OrderRecord, OrderError> {
  const order = orders.get(id);
  if (!order) {
    return err({ code: 'NOT_FOUND', message: `Order ${id} not found` });
  }
  return ok(order);
}

export function markPaid(order: OrderRecord): Result<OrderRecord, OrderError> {
  if (order.status === 'paid') {
    return err({ code: 'ALREADY_PAID', message: `Order ${order.id} already paid` });
  }
  return ok({ ...order, status: 'paid' });
}
