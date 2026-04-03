import { NavLink } from "react-router-dom";

export default function Sidebar() {
  const links = [
    { name: "Home", path: "/", icon: "home" },
    { name: "Analytics", path: "/analytics", icon: "analytics" },
    { name: "Config", path: "/config", icon: "settings" }
  ];

  return (
    <aside className="fixed left-0 top-16 bottom-0 flex flex-col p-4 w-64 bg-[#181c22] z-40 text-sm font-medium Inter">
      <div className="flex flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md ease-out duration-150 ${
                isActive
                  ? "bg-[#262A31] text-[#58A6FF]"
                  : "text-[#dfe2eb]/70 hover:bg-[#262a31] hover:text-[#dfe2eb]"
              }`
            }
          >
            <span className="material-symbols-outlined">{link.icon}</span>
            <span>{link.name}</span>
          </NavLink>
        ))}
      </div>
      
      <div className="mt-auto pt-4 border-t border-[#dfe2eb]/5 flex items-center gap-3 px-3">
        <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-on-primary-fixed text-sm" data-icon="terminal">terminal</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[#dfe2eb] text-xs font-bold leading-tight">Truvak</span>
          <span className="text-[#dfe2eb]/40 text-[10px] uppercase tracking-wider">Enterprise</span>
        </div>
      </div>
    </aside>
  );
}
