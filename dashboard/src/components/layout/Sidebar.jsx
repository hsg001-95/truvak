import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen fixed left-0 top-0 overflow-y-auto bg-[#161b22] flex flex-col shadow-2xl shadow-black/50 z-50">
      <div className="px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-container rounded flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>deployed_code</span>
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight">Truvak</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Intelligent Monolith</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 px-2 space-y-1">
        <NavLink to="/" end className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="home">home</span>
          <span>Home</span>
        </NavLink>
        <NavLink to="/live-orders" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="shopping_cart">shopping_cart</span>
          <span>Live Orders</span>
        </NavLink>

        <NavLink to="/score-order" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="grading">grading</span>
          <span>Score Order</span>
        </NavLink>
        <NavLink to="/buyer-management" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="group">group</span>
          <span>Buyer Management</span>
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="insights">insights</span>
          <span>Analytics</span>
        </NavLink>
        <NavLink to="/rule-config" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="settings_input_component">settings_input_component</span>
          <span>Rule Config</span>
        </NavLink>
        <NavLink to="/model-insights" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="query_stats">query_stats</span>
          <span>Model Insights</span>
        </NavLink>
        <NavLink to="/config" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 font-['Inter'] text-sm tracking-wide ${isActive ? 'bg-[#262a31] text-[#58a6ff] border-l-2 border-[#58a6ff]' : 'text-gray-400 hover:bg-[#262a31] hover:text-white border-l-2 border-transparent'}`}>
          <span className="material-symbols-outlined shrink-0" data-icon="settings">settings</span>
          <span>System Config</span>
        </NavLink>
      </nav>
      
      <div className="px-2 py-6 mt-auto">
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer text-gray-400 hover:bg-[#262a31] hover:text-white transition-all duration-200 font-['Inter'] text-sm tracking-wide">
          <span className="material-symbols-outlined" data-icon="logout">logout</span>
          <span>Log Out</span>
        </div>
      </div>
    </aside>
  );
}
