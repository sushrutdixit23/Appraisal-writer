export function CreditsIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  const id = "ci" + Math.random().toString(36).slice(2, 7);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="20" y1="0" x2="80" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4A9EFF"/>
          <stop offset="45%" stopColor="#5B4BFF"/>
          <stop offset="100%" stopColor="#7B2FE0"/>
        </linearGradient>
      </defs>
      <path
        d="M50 4
           C50.8 4 53 22 54.5 33
           C56 44 60 48 71 49.5
           C82 51 96 50 96 50
           C96 50 82 49 71 50.5
           C60 52 56 56 54.5 67
           C53 78 50.8 96 50 96
           C49.2 96 47 78 45.5 67
           C44 56 40 52 29 50.5
           C18 49 4 50 4 50
           C4 50 18 51 29 49.5
           C40 48 44 44 45.5 33
           C47 22 49.2 4 50 4Z"
        fill={`url(#${id})`}
      />
      <path
        d="M50 36
           C50.2 36 51.5 43 52 46
           C52.5 49 54 50.5 57 51
           C60 51.5 64 51 64 50
           C64 49 60 48.5 57 49
           C54 49.5 52.5 51 52 54
           C51.5 57 50.2 64 50 64
           C49.8 64 48.5 57 48 54
           C47.5 51 46 49.5 43 49
           C40 48.5 36 49 36 50
           C36 51 40 51.5 43 51
           C46 50.5 47.5 49 48 46
           C48.5 43 49.8 36 50 36Z"
        fill="white"
      />
    </svg>
  );
}
