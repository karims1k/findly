import { Baloo_2 } from "next/font/google";

const baloo = Baloo_2({ subsets: ["latin"], weight: ["700", "800"] });

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-md"
        aria-hidden
      >
        <defs>
          <linearGradient id="findly-badge" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#d946ef" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#findly-badge)" />
        {/* magnifying glass = comparison/search */}
        <circle cx="16.5" cy="17" r="7" stroke="white" strokeWidth="2.75" />
        <line x1="21.5" y1="22" x2="27.5" y2="28" stroke="white" strokeWidth="3" strokeLinecap="round" />
        {/* sparkle = beauty */}
        <path d="M29 7 L30.4 10.6 L34 12 L30.4 13.4 L29 17 L27.6 13.4 L24 12 L27.6 10.6 Z" fill="#fff5b8" />
      </svg>
      <span className={`${baloo.className} logo-text bg-clip-text text-4xl font-extrabold tracking-tight text-transparent`}>
        Findly
      </span>
    </div>
  );
}
