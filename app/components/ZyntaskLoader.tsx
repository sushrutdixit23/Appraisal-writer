type Props = {
  size?: number;
};

const PATH = "M96.34,10.65 C85.35,11.93 75.02,17.98 68.08,27.19 C65.05,31.20 63.27,34.48 60.05,42.03 C51.64,61.66 40.55,80.77 25.07,102.37 C17.04,113.59 14.87,117.35 12.71,123.88 C10.83,129.48 10.19,133.05 10.00,139.17 C9.65,149.40 11.53,157.30 16.34,165.80 C23.57,178.67 36.41,187.18 51.32,189.03 C56.51,189.67 59.99,189.44 72.51,187.79 C91.91,185.21 112.20,185.27 132.08,187.95 C139.12,188.90 143.61,189.35 146.42,189.35 C161.14,189.35 174.87,182.53 183.66,170.87 C193.85,157.27 196.21,139.14 190.00,122.28 C187.99,116.84 185.51,112.66 178.40,102.69 C174.36,97.05 167.92,87.62 166.14,84.69 C165.56,83.80 164.13,81.51 162.92,79.59 C155.18,67.30 148.90,55.35 142.79,41.17 C139.06,32.51 137.12,29.23 133.01,24.54 C123.70,14.06 110.42,9.03 96.34,10.65 Z";

export default function ZyntaskLoader({ size = 72 }: Props) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="zyntaskLoaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E1EE0" />
            <stop offset="100%" stopColor="#2F8CF0" />
          </linearGradient>
        </defs>
        <path className="zt-ring zt-ring1" d={PATH} fill="none" stroke="#5B4BFF" strokeWidth="2.5" />
        <path className="zt-ring zt-ring2" d={PATH} fill="none" stroke="#5B4BFF" strokeWidth="2.5" />
        <path className="zt-ring zt-ring3" d={PATH} fill="none" stroke="#5B4BFF" strokeWidth="2.5" />
        <path className="zt-core" d={PATH} fill="url(#zyntaskLoaderGrad)" />
      </svg>
      <style>{`
        .zt-ring { transform-origin: 50% 50%; transform-box: fill-box; opacity: 0; animation: zt-ripple 2.1s cubic-bezier(0.2,0.6,0.35,1) infinite; }
        .zt-ring1 { animation-delay: 0s; }
        .zt-ring2 { animation-delay: 0.7s; }
        .zt-ring3 { animation-delay: 1.4s; }
        .zt-core { transform-origin: 50% 50%; transform-box: fill-box; animation: zt-pulse 2.1s ease-in-out infinite; }
        @keyframes zt-ripple {
          0% { transform: scale(0.55); opacity: 0; }
          12% { opacity: 0.85; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes zt-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
