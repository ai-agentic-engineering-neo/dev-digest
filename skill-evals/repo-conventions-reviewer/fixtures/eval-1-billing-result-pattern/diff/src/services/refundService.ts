import { ok, Result } from '../lib/result';
import { OrderRecord } from './orderService';

export interface RefundError {
  code: 'INVALID_AMOUNT';
  message: string;
}

export function refundOrder(order: OrderRecord, amountDollars: number): Result<OrderRecord, RefundError> {
  if (amountDollars <= 0) {
    throw new Error('Refund amount must be positive');
  }

  order.status = 'refunded';

  return ok(order);
}

export function calculateRefundFee(amountDollars: number): number {
  return amountDollars * 0.029;
}
