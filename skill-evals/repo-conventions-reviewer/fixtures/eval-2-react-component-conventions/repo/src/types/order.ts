export interface Order {
  id: string;
  status: 'pending' | 'paid' | 'refunded';
}
