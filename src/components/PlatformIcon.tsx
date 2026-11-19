import { Globe } from 'lucide-react';

interface PlatformIconProps {
  platform: string;
  className?: string;
}

export function PlatformIcon({ platform, className = 'w-4 h-4' }: PlatformIconProps) {
  const key = (platform || '').toLowerCase();

  if (key === 'tiktok') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={`${className} text-zinc-100`}
      >
        <path d="M16.7 3h-3.1v11.6a2.85 2.85 0 1 1-2.85-2.85c.31 0 .6.05.88.14V8.7a6 6 0 0 0-.88-.06A6 6 0 1 0 16.7 14.6V8.65a7.3 7.3 0 0 0 4.3 1.4V6.98A4.25 4.25 0 0 1 16.7 3Z" />
      </svg>
    );
  }

  if (key === 'instagram') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`${className} text-rose-400`}
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.25" cy="6.75" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (key === 'facebook') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={`${className} text-blue-400`}
      >
        <path d="M13.8 21v-8.1h2.7l.4-3.15h-3.1V7.73c0-.91.25-1.53 1.56-1.53h1.66V3.38A22 22 0 0 0 14.6 3.25c-2.4 0-4.04 1.46-4.04 4.15v2.35H7.85v3.15h2.71V21h3.24Z" />
      </svg>
    );
  }

  if (key === 'twitter' || key === 'x') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={`${className} text-zinc-200`}
      >
        <path d="M18.24 3H21l-6.02 6.88L22 21h-5.54l-4.34-5.67L7.16 21H4.4l6.44-7.36L4 3h5.68l3.92 5.18L18.24 3Zm-.97 16.3h1.53L8.82 4.61H7.18l10.09 14.69Z" />
      </svg>
    );
  }

  if (key === 'reddit') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`${className} text-orange-400`}
      >
        <circle cx="12" cy="14" r="6.5" />
        <path d="M12 7.5 13.8 3.8l3.2.7" />
        <circle cx="17.8" cy="4.7" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="9.6" cy="13.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.4" cy="13.5" r="1" fill="currentColor" stroke="none" />
        <path d="M9.5 16.5c1.5 1 3.5 1 5 0" />
      </svg>
    );
  }

  if (key === 'vimeo') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={`${className} text-sky-400`}
      >
        <path d="M21 7.4c-.1 2.1-1.6 5-4.4 8.6-2.9 3.8-5.4 5.7-7.4 5.7-1.2 0-2.3-1.1-3.1-3.4l-1.7-6.2C3.8 9.8 3.2 8.7 2.5 8.7c-.2 0-.7.3-1.5.9L0 8.3c.9-.8 1.8-1.6 2.7-2.4 1.2-1 2.1-1.6 2.7-1.6 1.4-.1 2.3.8 2.6 2.8.4 2.2.7 3.5.8 4 .5 2 1 3 1.5 3 .4 0 1-.7 1.8-2 .8-1.3 1.2-2.2 1.3-2.9.1-1.1-.3-1.6-1.3-1.6-.5 0-.9.1-1.4.3.9-3 2.7-4.5 5.2-4.4 1.9.1 2.8 1.3 2.7 3.9Z" />
      </svg>
    );
  }

  return <Globe className={`${className} text-emerald-400`} aria-hidden="true" />;
}
