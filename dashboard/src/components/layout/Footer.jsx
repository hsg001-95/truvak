export default function Footer() {
  return (
    <footer className="w-full md:w-[calc(100%-16rem)] py-6 mt-auto bg-[#0d1117] border-t border-[#31353c]/15 flex flex-col md:flex-row justify-between items-center px-8 md:ml-64 font-['Inter'] text-xs font-medium uppercase tracking-widest text-gray-500">
      <div className="flex items-center gap-6 mb-4 md:mb-0">
        <span>© 2024 Truvak Intelligent Systems</span>
      </div>
      <div className="flex gap-8">
        <a className="hover:text-white transition-opacity duration-150 cursor-pointer" href="#">Documentation</a>
        <a className="hover:text-white transition-opacity duration-150 cursor-pointer" href="#">Privacy Policy</a>
        <a className="hover:text-white transition-opacity duration-150 cursor-pointer" href="#">Support</a>
      </div>
    </footer>
  );
}
