interface PlatformIconProps {
  platform: string;
  className?: string;
}

export function PlatformIcon({ platform, className = 'w-4 h-4 shrink-0' }: PlatformIconProps) {
  const key = (platform || '').toLowerCase();

  if (key === 'tiktok') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M15.6 3c.35 2.4 1.85 3.9 4.2 4.15v2.75c-1.5-.06-2.85-.54-4.05-1.36v5.86a5.45 5.45 0 1 1-4.8-5.41v2.84a2.65 2.65 0 1 0 1.95 2.57V3h2.7Z"
          fill="#25F4EE"
          transform="translate(-0.7, -0.5)"
        />
        <path
          d="M15.6 3c.35 2.4 1.85 3.9 4.2 4.15v2.75c-1.5-.06-2.85-.54-4.05-1.36v5.86a5.45 5.45 0 1 1-4.8-5.41v2.84a2.65 2.65 0 1 0 1.95 2.57V3h2.7Z"
          fill="#FE2C55"
          transform="translate(0.7, 0.5)"
        />
        <path
          d="M15.6 3c.35 2.4 1.85 3.9 4.2 4.15v2.75c-1.5-.06-2.85-.54-4.05-1.36v5.86a5.45 5.45 0 1 1-4.8-5.41v2.84a2.65 2.65 0 1 0 1.95 2.57V3h2.7Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (key === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <defs>
          <linearGradient id="wk-ig-grad" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="url(#wk-ig-grad)" />
        <rect x="5.5" y="5.5" width="13" height="13" rx="3.8" stroke="#FFFFFF" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="3.1" stroke="#FFFFFF" strokeWidth="1.6" />
        <circle cx="16.2" cy="7.8" r="1" fill="#FFFFFF" />
      </svg>
    );
  }

  if (key === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#1877F2" />
        <path
          d="M13.6 21.85v-7.5h2.52l.38-2.92h-2.9V9.56c0-.85.24-1.43 1.46-1.43h1.55V5.52c-.27-.04-1.2-.12-2.27-.12-2.25 0-3.79 1.37-3.79 3.9v2.13H8v2.92h2.55v7.5c.5.08 1.02.12 1.54.12.52 0 1.02-.04 1.51-.12Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (key === 'twitter' || key === 'x') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M17.9 3.25h2.98l-6.51 7.44L22 20.75h-6l-4.7-6.14-5.38 6.14H2.93l6.96-7.95L2.5 3.25h6.15l4.25 5.61 5-5.61Zm-1.05 15.72h1.65L7.75 4.94H5.98l10.87 14.03Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (key === 'reddit') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#FF4500" />
        <path
          d="M18.35 12.1a1.45 1.45 0 0 0-2.46-1.03 7.1 7.1 0 0 0-3.75-1.15l.64-3 2.08.44a1.05 1.05 0 1 0 .14-.68l-2.42-.52a.35.35 0 0 0-.41.27l-.72 3.42a7.1 7.1 0 0 0-3.82 1.15 1.45 1.45 0 1 0-1.6 2.38c-.02.16-.03.32-.03.48 0 2.45 2.86 4.44 6.38 4.44s6.38-1.99 6.38-4.44c0-.16-.01-.32-.04-.48.24-.26.38-.61.38-.98Z"
          fill="#FFFFFF"
        />
        <circle cx="9.6" cy="13.2" r="1" fill="#FF4500" />
        <circle cx="14.4" cy="13.2" r="1" fill="#FF4500" />
        <path
          d="M9.6 15.8c.65.62 1.54.92 2.4.92s1.75-.3 2.4-.92"
          stroke="#FF4500"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === 'vimeo') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#1AB7EA" />
        <path
          d="M17.5 8.8c-.05 1.15-.85 2.72-2.4 4.72-1.6 2.08-2.95 3.12-4.05 3.12-.68 0-1.26-.63-1.73-1.88l-.94-3.45c-.35-1.25-.72-1.88-1.12-1.88-.09 0-.39.18-.9.54l-.54-.7c.57-.5 1.13-1 1.68-1.5.76-.66 1.33-1 1.7-1.04.89-.09 1.44.52 1.65 1.83.22 1.41.38 2.29.47 2.64.26 1.18.55 1.77.86 1.77.25 0 .62-.39 1.11-1.17.49-.78.75-1.37.79-1.78.07-.68-.2-1.02-.79-1.02-.28 0-.57.06-.87.19.58-1.9 1.68-2.82 3.31-2.77 1.2.03 1.77.81 1.77 2.38Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  // MP3 · HLS / Direct media stream icon
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="wk-media-grad" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#wk-media-grad)" />
      <path
        d="M9.75 8.2v6.6a1.9 1.9 0 1 1-1.4-1.83V7.3l6.8-1.4v7.6a1.9 1.9 0 1 1-1.4-1.83V8.05l-4 .15Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
