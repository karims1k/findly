export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width="52"
        height="52"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm"
        aria-hidden
      >
        <defs>
          <linearGradient id="findly-badge" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e8b4b6" />
            <stop offset="100%" stopColor="#d1868a" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#findly-badge)" />
        {/* magnifying glass = comparison/search */}
        <circle cx="16.5" cy="17" r="7" stroke="white" strokeWidth="2.75" />
        <line x1="21.5" y1="22" x2="27.5" y2="28" stroke="white" strokeWidth="3" strokeLinecap="round" />
        {/* sparkle = beauty */}
        <path d="M29 7 L30.4 10.6 L34 12 L30.4 13.4 L29 17 L27.6 13.4 L24 12 L27.6 10.6 Z" fill="white" fillOpacity="0.9" />
      </svg>
      <span className="relative inline-block font-serif text-4xl font-semibold tracking-tight text-brandbrown">
        Findly
        <span aria-hidden className="absolute -top-1.5 -right-4 text-lg text-dustyrose-dark">
          ♥
        </span>
      </span>
    </div>
  );
}
