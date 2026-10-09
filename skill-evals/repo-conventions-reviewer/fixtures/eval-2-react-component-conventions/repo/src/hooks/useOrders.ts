import { useEffect, useState } from 'react';
import type { Order } from '../types/order';

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => setOrders(data))
      .finally(() => setLoading(false));
  }, []);

  return { orders, loading };
}
