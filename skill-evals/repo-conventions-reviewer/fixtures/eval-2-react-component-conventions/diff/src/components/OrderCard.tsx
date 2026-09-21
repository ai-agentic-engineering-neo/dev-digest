import { useEffect, useState } from 'react';
import type { Order } from '../types/order';

export function OrderCard({ order, onSelect }: { order: Order; onSelect: () => void }) {
  const [detail, setDetail] = useState<Order>(order);

  useEffect(() => {
    fetch(`/api/orders/${order.id}`)
      .then((res) => res.json())
      .then((data) => setDetail(data));
  }, [order.id]);

  function selectClicked() {
    onSelect();
  }

  return (
    <div className="order-card" onClick={selectClicked}>
      <span>{detail.id}</span>
    </div>
  );
}
