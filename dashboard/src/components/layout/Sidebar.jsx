import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/live-orders", label: "Live Orders", icon: "shopping_cart" },
  { to: "/score-order", label: "Score Order", icon: "grading" },
  { to: "/buyer-management", label: "Buyer Management", icon: "group" },
  { to: "/analytics", label: "Analytics", icon: "insights" },
  { to: "/rule-config", label: "Rule Config", icon: "settings_input_component" },
  { to: "/model-insights", label: "Model Insights", icon: "query_stats" },
  { to: "/review-intelligence", label: "Review Intelligence", icon: "manage_search" },
  { to: "/review-analysis", label: "Review Analysis", icon: "fact_check" },
  { to: "/review-dashboard", label: "Review Dashboard", icon: "shield_check" },
  { to: "/suspicious-products", label: "Suspicious Products", icon: "visibility_off" },
  { to: "/product-insights", label: "Product Insights", icon: "insights" },
  { to: "/config", label: "System Config", icon: "settings" },
];

function SidebarNavItem({ to, icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 cursor-pointer rounded-r-md border-l-2 transition-all duration-200 font-['Inter'] text-sm tracking-wide ${
          isActive
            ? "bg-[#262a31] text-[#2F81F7] border-[#2F81F7]"
            : "text-[#8B949E] border-transparent hover:bg-[#2a3038] hover:text-white"
        }`
      }
    >
      <span className="material-symbols-outlined shrink-0" data-icon={icon}>
        {icon}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-64 max-md:w-56 h-screen fixed left-0 top-0 overflow-y-auto bg-[#161b22] flex flex-col shadow-2xl shadow-black/50 z-50">
      <div className="px-6 py-8">
        <div className="flex items-center gap-3">
          <img
            src="/truvak-logo.png"
            alt="Truvak"
            className="w-9 h-9 object-contain rounded drop-shadow-[0_0_8px_rgba(88,166,255,0.5)]"
          />
          <div>
            <h1 className="text-lg font-black text-white tracking-tight">Truvak</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Intelligent Monolith</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            end={item.end}
          />
        ))}
      </nav>

      <div className="px-2 py-6 mt-auto">
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-r-md text-[#8B949E] hover:bg-[#2a3038] hover:text-white transition-all duration-200 font-['Inter'] text-sm tracking-wide">
          <span className="material-symbols-outlined" data-icon="logout">
            logout
          </span>
          <span>Log Out</span>
        </div>
      </div>
    </aside>
  );
}
