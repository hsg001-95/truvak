import React, { useState, useEffect } from 'react';

export default function SplashScreen({ onComplete }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Exact timing from the HTML: fade out at 8s, completely unmount at 8.8s
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, 2500);

    const unmountTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 3000);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete]);

  const handleSkip = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 800);
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0D1117] overflow-hidden ${isExiting ? 'animate-splash-exit' : ''}`}
      id="splash-screen"
    >
      {/* Center Wordmark and Pulsing Effect */}
      <div className="relative flex flex-col items-center">
        {/* Pulsing Rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-48 h-48 rounded-full border border-primary animate-pulse-ring"></div>
          <div className="w-48 h-48 rounded-full border border-primary animate-pulse-ring" style={{ animationDelay: '0.5s' }}></div>
        </div>
        
        {/* Wordmark */}
        <h1 className="text-[48px] font-black tracking-tighter text-white relative z-10">Truvak</h1>
        
        {/* Tagline */}
        <p className="mt-4 text-[#8B949E] text-base font-medium animate-fade-in-delayed-1">
          Trust Intelligence for Indian Commerce
        </p>
        
        {/* Developer Credit */}
        <p className="mt-2 text-[#2F81F7] text-sm font-semibold tracking-wide animate-fade-in-delayed-2">
          Developed by Snoxx Tech
        </p>
      </div>
      
      {/* Footer Info */}
      <div className="absolute bottom-8 w-full px-12 flex justify-between items-end">
        <div className="flex-1"></div>
        <div className="text-[#8B949E] text-[12px] font-medium flex-1 text-center">
          Copyright 2024 Snoxx Tech All rights reserved
        </div>
        <div className="flex-1 flex justify-end">
          <button 
            onClick={handleSkip}
            className="flex items-center gap-2 text-primary hover:text-white transition-colors duration-300 animate-fade-in-delayed-3"
          >
            <span className="text-sm font-bold uppercase tracking-widest">Skip</span>
            <span className="material-symbols-outlined text-lg" data-icon="arrow_forward">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
