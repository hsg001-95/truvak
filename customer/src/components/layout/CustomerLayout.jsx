import { Link, useLocation, useNavigate } from "react-router-dom";

const navItems = [
  { label: "Home", to: "/" },
  { label: "Spend", to: "/spend" },
  { label: "Watchlist", to: "/watchlist" },
  { label: "Profile", to: "/profile" },
  { label: "Settings", to: "/settings" },
];

export default function CustomerLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("truvak_customer_token");
    localStorage.removeItem("truvak_customer_id");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      <header className="sticky top-0 z-20 border-b border-[#30363D] bg-[#0D1117]/90 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-lg font-bold">Truvak</h1>
          <button onClick={handleLogout} className="text-sm text-[#8B949E] hover:text-[#E6EDF3]">
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="hidden w-56 border-r border-[#30363D] p-4 md:block">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  location.pathname === item.to
                    ? "bg-[#161B22] text-[#2F81F7]"
                    : "text-[#8B949E] hover:bg-[#161B22] hover:text-[#E6EDF3]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="w-full flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
