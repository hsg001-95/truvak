import { useState } from 'react';

export default function RuleConfig() {
  const [threshold, setThreshold] = useState(40);
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold border-b border-dark-border pb-4">⚙️ Rule Configuration</h1>
      
      <div className="bg-dark-paper border border-dark-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-2">COD Block Threshold</h3>
        <p className="text-sm text-brand-muted mb-6">Orders below this trust score will have COD blocked automatically.</p>
        
        <div className="mb-8">
           <label className="block font-semibold mb-2 text-sm text-brand-blue">Current Configuration: {threshold}</label>
           <input 
             type="range" 
             value={threshold} 
             min="0" max="100" step="5"
             className="w-full accent-brand-blue bg-dark-grid appearance-none h-2 rounded-full cursor-pointer"
             onChange={e => setThreshold(Number(e.target.value))}
           />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6 text-sm font-semibold">
           <div className="bg-[#2D1117] text-[#FCA5A5] border border-[#DA3633] p-3 rounded-lg flex items-center shadow-inner">
             🔴 Block COD — score {'<'} {threshold}
           </div>
           <div className="bg-[#2D1D0A] text-[#FDE047] border border-[#9E6A03] p-3 rounded-lg flex items-center shadow-inner">
             🟡 Warn — score {threshold}–70
           </div>
           <div className="bg-[#0D2818] text-[#86EFAC] border border-[#238636] p-3 rounded-lg flex items-center shadow-inner">
             🟢 Approve — score {'>'} 70
           </div>
        </div>
        
        <button className="btn-primary w-full">💾 Save Threshold Configuration</button>
      </div>
    </div>
  );
}
