import React from 'react';

export function BrainCircuitMark({ className = 'w-11 h-11' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="brainBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#312E81" />
        </linearGradient>
        <linearGradient id="brainStroke" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#brainBg)" stroke="#4F46E5" strokeOpacity="0.45" />
      <path
        d="M31 15C24.5 15 20 19.5 20 25C17 26.5 15 29.8 15 33.5C15 38.2 18.2 42 22.5 43.2C23.5 46.8 26.8 49 31 49V15Z"
        stroke="url(#brainStroke)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M33 15C39.5 15 44 19.5 44 25C47 26.5 49 29.8 49 33.5C49 38.2 45.8 42 41.5 43.2C40.5 46.8 37.2 49 33 49V15Z"
        stroke="url(#brainStroke)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="27" r="2.2" fill="#38BDF8" />
      <circle cx="40" cy="27" r="2.2" fill="#38BDF8" />
      <circle cx="25" cy="37" r="2.2" fill="#818CF8" />
      <circle cx="39" cy="37" r="2.2" fill="#818CF8" />
      <path d="M24 27L31 32M40 27L33 32M25 37L31 32M39 37L33 32" stroke="#38BDF8" strokeWidth="1.5" />
    </svg>
  );
}

export function UkFlagMark({ className = 'w-11 h-7 rounded-[4px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 36" className={className} aria-label="United Kingdom flag" role="img">
      <clipPath id="ukClip">
        <rect width="60" height="36" rx="4" />
      </clipPath>
      <g clipPath="url(#ukClip)">
        <rect width="60" height="36" fill="#012169" />
        <path d="M0 0L60 36M60 0L0 36" stroke="#FFFFFF" strokeWidth="7" />
        <path d="M0 0L60 36M60 0L0 36" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0V36M0 18H60" stroke="#FFFFFF" strokeWidth="11" />
        <path d="M30 0V36M0 18H60" stroke="#C8102E" strokeWidth="6.5" />
      </g>
    </svg>
  );
}
