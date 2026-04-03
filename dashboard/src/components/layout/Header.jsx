export default function Header() {
  return (
    <header className="flex justify-between items-center w-full px-6 h-16 bg-[#10141a] fixed top-0 z-50 font-inter tracking-tight">
      <div className="flex items-center gap-8">
        <span className="text-xl font-bold tracking-tighter text-[#dfe2eb]">Truvak Enterprise Console</span>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a className="text-[#58A6FF] font-semibold border-b-2 border-[#58A6FF] pb-1 transition-colors duration-150" href="#">Dashboard</a>
          <a className="text-[#dfe2eb]/60 hover:text-[#58A6FF] transition-colors duration-150" href="#">Settings</a>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <button className="material-symbols-outlined text-[#dfe2eb]/60 hover:text-[#58A6FF] transition-colors duration-150 active:scale-95">notifications</button>
          <button className="material-symbols-outlined text-[#dfe2eb]/60 hover:text-[#58A6FF] transition-colors duration-150 active:scale-95">logout</button>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant">
          <img alt="Merchant Profile" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAgO0mp8VXWaqDqooBKGu_I6NhW9fg4pi10l04mKzhNU0lzTiSciQydpAbu6VGIPXSgJXPvIivSg2Qj3sEusBVdZt3e3H6mEgteMEPBAErs1Nft7DXEXgjCYDy48bZCfxyd3ohKPRFnPN79R-0keSIPbySBxaoP3o8E5oOQjKlr76TMV-53XI3-IF7IBDH5xMoYdXeBYr2S8y_Th8OjoU_M2rPjJT1hk-R6lVLcixBJsw0CQ_W14_zHsHHkPNPjBCd8D0paulfBfQ" />
        </div>
      </div>
    </header>
  );
}
