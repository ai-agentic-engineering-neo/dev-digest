import { ok, err, Result } from '../lib/result';
import { OrderRecord } from './orderService';

export interface PaymentError {
  code: 'DECLINED' | 'INVALID_AMOUNT';
  message: string;
}

export function chargeCard(order: OrderRecord, amountCents: number): Result<OrderRecord, PaymentError> {
  if (amountCents <= 0) {
    return err({ code: 'INVALID_AMOUNT', message: 'amountCents must be positive' });
  }
  if (amountCents !== order.totalCents) {
    return err({ code: 'DECLINED', message: 'amount does not match order total' });
  }
  return ok({ ...order, status: 'paid' });
}

export function calculateProcessingFee(amountCents: number): number {
  return Math.round(amountCents * 0.029);
}
