import React from 'react';

interface LicensePlateBadgeProps {
  plateNumber: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LicensePlateBadge: React.FC<LicensePlateBadgeProps> = ({
  plateNumber,
  className = '',
  size = 'md'
}) => {
  const isFallback = plateNumber.startsWith('BRAK_NR') || plateNumber.startsWith('Umowa');

  if (isFallback) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-mono font-medium border border-slate-300 ${className}`}
      >
        {plateNumber}
      </span>
    );
  }

  const sizeClasses = {
    sm: 'h-6 text-xs px-1',
    md: 'h-8 text-sm px-1.5',
    lg: 'h-10 text-base px-2'
  };

  const blueEuroStripWidth = {
    sm: 'w-4',
    md: 'w-5',
    lg: 'w-6'
  };

  return (
    <div
      className={`inline-flex items-center bg-white border-2 border-slate-900 rounded shadow-xs overflow-hidden font-mono font-bold tracking-wider select-none ${sizeClasses[size]} ${className}`}
      title={`Numer rejestracyjny: ${plateNumber}`}
    >
      <div
        className={`bg-blue-700 text-white flex flex-col items-center justify-center self-stretch -my-1 -ml-1 mr-2 px-1 text-[8px] font-sans font-semibold leading-none ${blueEuroStripWidth[size]}`}
      >
        <span className="text-[7px] text-yellow-300 mb-0.5" aria-hidden="true">★</span>
        <span className="tracking-tighter">PL</span>
      </div>

      <span className="text-slate-950 tabular-nums uppercase pr-1 font-extrabold">
        {plateNumber}
      </span>
    </div>
  );
};
