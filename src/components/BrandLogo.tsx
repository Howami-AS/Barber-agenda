import React from 'react';

interface BrandLogoProps {
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ name = 'Barber Agenda', size = 'md' }) => {
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 64 64"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <rect width="64" height="64" rx="12" fill="#252525" stroke="#C9A15B" strokeOpacity="0.45" strokeWidth="2" />
        <polygon
          points="32,12 48,21 48,43 32,52 16,43 16,21"
          fill="#171717"
          stroke="#C9A15B"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M25 22H34C38 22 40.5 24.5 40.5 28C40.5 30.5 38.8 32.2 36.5 33C39.2 33.8 41 36 41 39C41 42.8 38 45.5 33.5 45.5H25V22Z"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <line x1="25" y1="33" x2="36.5" y2="33" stroke="#C9A15B" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className={`font-display font-semibold tracking-tight text-white ${textSize}`}>
        {name}
      </span>
    </span>
  );
};
