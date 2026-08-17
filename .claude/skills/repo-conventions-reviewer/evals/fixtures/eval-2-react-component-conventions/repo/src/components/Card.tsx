import { cn } from '../lib/cn';

interface CardProps {
  title: string;
  className?: string;
  onExpand?: () => void;
}

export function Card({ title, className, onExpand }: CardProps) {
  function handleExpand() {
    onExpand?.();
  }

  return (
    <div className={cn('card', className)} onClick={handleExpand}>
      <h3>{title}</h3>
    </div>
  );
}
