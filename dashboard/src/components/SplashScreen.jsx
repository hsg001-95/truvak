import { useEffect, useState } from 'react';

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('enter'); // 'enter' | 'exit'

  useEffect(() => {
    // Hold for 1.8s then fade out
    const hold = setTimeout(() => setPhase('exit'), 1800);
    // Unmount after fade completes (400ms)
    const done = setTimeout(() => onDone?.(), 2200);
    return () => { clearTimeout(hold); clearTimeout(done); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0e14]"
      style={{
        transition: 'opacity 400ms ease',
        opacity: phase === 'exit' ? 0 : 1,
        pointerEvents: phase === 'exit' ? 'none' : 'all',
      }}
    >
      {/* Radial glow behind logo */}
      <div
        className="absolute w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(88,166,255,0.18) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }}
      />

      {/* Logo + wordmark */}
      <div className="relative flex flex-col items-center gap-5 animate-[fadeUp_0.5s_ease_both]">
        <img
          src="/truvak-logo.png"
          alt="Truvak"
          className="w-24 h-24 object-contain drop-shadow-[0_0_24px_rgba(88,166,255,0.5)]"
        />

        <div className="flex flex-col items-center gap-1">
          <span
            className="text-4xl font-black tracking-tighter"
            style={{ color: '#dfe2eb', letterSpacing: '-0.04em' }}
          >
            Truvak
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.3em]"
            style={{ color: '#58a6ff' }}
          >
            Intelligent Monolith
          </span>
        </div>

        {/* Pulse loader dots */}
        <div className="flex gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#58a6ff]"
              style={{
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
