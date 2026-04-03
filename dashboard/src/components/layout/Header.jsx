export default function Header() {
  return (
    <header className="w-full md:w-[calc(100%-16rem)] h-16 sticky top-0 z-40 md:ml-64 bg-[#0d1117] flex justify-between items-center px-6 font-['Inter'] font-normal text-sm border-b border-[#31353c]/20">
      <div className="flex items-center gap-4">
        <div className="relative group">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
            <span className="material-symbols-outlined text-sm" data-icon="search">search</span>
          </span>
          <input 
            className="bg-[#161b22] border-none text-sm rounded-lg focus:ring-1 focus:ring-[#58a6ff] block w-48 md:w-64 pl-10 p-2 text-white placeholder-gray-500" 
            placeholder="Search parameters..." 
            type="text"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-3 md:gap-6">
        <div className="flex gap-2 md:gap-4">
          <button className="text-gray-400 hover:bg-[#31353c] p-2 rounded transition-colors duration-150 cursor-pointer active:opacity-80">
            <span className="material-symbols-outlined" data-icon="notifications">notifications</span>
          </button>
          <button className="text-gray-400 hover:bg-[#31353c] p-2 rounded transition-colors duration-150 cursor-pointer active:opacity-80 hidden md:block">
            <span className="material-symbols-outlined" data-icon="settings">settings</span>
          </button>
          <button className="text-gray-400 hover:bg-[#31353c] p-2 rounded transition-colors duration-150 cursor-pointer active:opacity-80 hidden md:block">
            <span className="material-symbols-outlined" data-icon="help">help</span>
          </button>
        </div>
        
        <div className="flex items-center gap-3 pl-3 md:pl-6 md:border-l border-[#31353c]">
          <img 
            alt="User Profile" 
            className="w-8 h-8 rounded-full border border-primary-container" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDmuIobBWbOB5QLKku4t4LfRBkTBxF4wGEIPRoHzYHwSivDFqpxrybI52intXK0kbvh1MNMzmI-lurFnTh611ZIZ3nJ8iX5oh0K1zZhrKZkQdo1jaKMqdJBOs8M9LNww9XAQdpbescfDDr18VT0fVmVY2N0fF0TMOlSliG_mC9_MV4PrSFoA_e2VtmVuvOA1z2nPj5JyguXHqlpVtRjD5CGBr4_-342P48UIWX7Mu4AJPibxR0foqVPkjX5RKn8BOoCLUcXkuqv0g"
          />
          <div className="hidden lg:block text-right">
            <p className="text-xs font-bold text-white leading-none">Alex Rivera</p>
            <p className="text-[10px] text-primary leading-none mt-1">Admin Access</p>
          </div>
        </div>
      </div>
    </header>
  );
}
