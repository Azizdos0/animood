interface MarkProps {
  size?: number;
  id?: string;
  className?: string;
}

export function LogoMark({ size = 32, id = "am", className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${id}-g)`} />
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${id}-s)`} />
      <path
        d="M13.5 35 L24 12.5 L34.5 35"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18.8 28 H29.2" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M37 9 l1.2 3.2 3.2 1.2 -3.2 1.2 -1.2 3.2 -1.2 -3.2 -3.2 -1.2 3.2 -1.2 z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({ size = 28, id = "am-nav" }: { size?: number; id?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} id={id} />
      <span className="font-display text-xl font-extrabold tracking-tight">
        <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Animood
        </span>
      </span>
    </span>
  );
}
