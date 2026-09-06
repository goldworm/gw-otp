import { useEffect, useState } from 'react';
import { cn } from '@/popup/lib/utils';

interface CountdownBarProps {
  period: number;
  size?: number;
  className?: string;
}

/**
 * Circular countdown timer.
 * Visualizes the remaining time using an SVG circle's stroke-dashoffset.
 */
export function CountdownBar({
  period,
  size = 20,
  className,
}: CountdownBarProps) {
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(period));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getRemainingSeconds(period));
    }, 1000);
    return () => clearInterval(interval);
  }, [period]);

  const ratio = remaining / period;
  const isUrgent = remaining <= 5;

  // SVG circle parameters
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={`${remaining} seconds remaining`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={cn(
            'transition-all duration-1000 ease-linear',
            isUrgent ? 'text-destructive' : 'text-primary',
          )}
        />
      </svg>
      <span
        className={cn(
          'absolute text-[8px] font-medium',
          isUrgent ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {remaining}
      </span>
    </div>
  );
}

function getRemainingSeconds(period: number): number {
  const now = Math.floor(Date.now() / 1000);
  return period - (now % period);
}
