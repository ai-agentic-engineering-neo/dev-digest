import { cn } from '../lib/cn';

interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary';
  className?: string;
  onClick?: () => void;
}

export function Button({ label, variant = 'primary', className, onClick }: ButtonProps) {
  function handleClick() {
    onClick?.();
  }

  return (
    <button className={cn('btn', `btn-${variant}`, className)} onClick={handleClick}>
      {label}
    </button>
  );
}
