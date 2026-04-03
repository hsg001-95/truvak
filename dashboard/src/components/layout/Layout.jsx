import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="bg-[#10141a] text-[#dfe2eb] font-sans antialiased min-h-screen">
      <Header />
      <Sidebar />
      <main className="ml-64 mt-16 p-8 min-h-[calc(100vh-64px)] overflow-y-auto pb-24">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
