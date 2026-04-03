export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-64 right-0 h-10 bg-surface-container-lowest border-t border-outline-variant/10 flex items-center justify-between px-8 text-[10px] font-mono text-slate-500 uppercase tracking-widest z-40">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
          <span>System Synchronizing</span>
        </div>
        <span>v4.2.0-STABLE</span>
      </div>
      <div className="flex items-center gap-6">
        <span>Latency: 24 ms</span>
        <span>Uptime: 99.9%</span>
      </div>
    </footer>
  );
}
