import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Footer from "./Footer";
import SplashScreen from "../ui/SplashScreen";

export default function Layout() {
  return (
    <>
      <SplashScreen />
      <div className="bg-[#10141a] text-[#dfe2eb] min-h-screen font-sans animate-dashboard-enter">
        <Sidebar />
        <Header />
        
        {/* Main Content */}
        <main className="md:ml-64 p-4 md:p-8 min-h-[calc(100vh-64px-72px)] overflow-x-hidden">
          <Outlet />
        </main>

        <Footer />
      </div>
    </>
  );
}
