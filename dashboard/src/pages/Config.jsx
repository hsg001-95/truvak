import React from 'react';

export default function Config() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header Section */}
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tighter text-on-surface mb-2">System Configuration</h1>
        <p className="text-on-surface-variant text-sm max-w-2xl">Manage the fundamental technical parameters of your Truvak Enterprise Node. Precision configuration affects high-density computational throughput.</p>
      </div>

      {/* Bento Layout Content */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Left Column: Primary Config Form */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <div className="bg-surface-container-low p-8 rounded-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-6xl" data-icon="settings_input_component">settings_input_component</span>
            </div>
            <h2 className="text-lg font-semibold text-on-surface mb-8 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" data-icon="dns">dns</span>
              Node Parameters
            </h2>
            <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
              
              {/* FormInput: Node Name */}
              <div className="flex flex-col gap-2">
                <label className="text-[#8B949E] text-[12px] font-medium uppercase tracking-wider">Node Name</label>
                <input className="bg-[#0D1117] border border-[#30363D] rounded-[8px] px-[14px] py-[10px] text-[#E6EDF3] text-[14px] focus:outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-[#8B949E]/50" placeholder="Enter node identifier" type="text" />
              </div>
              
              {/* FormInput: Admin Email (Focused/Active) */}
              <div className="flex flex-col gap-2">
                <label className="text-[#8B949E] text-[12px] font-medium uppercase tracking-wider">Admin Email</label>
                <div className="relative group">
                  <input className="w-full bg-[#0D1117] border border-[#2F81F7] shadow-[0_0_12px_rgba(47,129,247,0.25)] rounded-[8px] px-[14px] py-[10px] text-[#E6EDF3] text-[14px] focus:outline-none transition-all" type="email" defaultValue="admin@truvak.com" />
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <span className="material-symbols-outlined text-[#2F81F7] text-sm" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                </div>
              </div>
              
              {/* FormInput: Resource Limit (Error State) */}
              <div className="flex flex-col gap-2">
                <label className="text-[#8B949E] text-[12px] font-medium uppercase tracking-wider">Resource Limit</label>
                <input className="bg-[#0D1117] border border-[#F85149] rounded-[8px] px-[14px] py-[10px] text-[#E6EDF3] text-[14px] focus:outline-none transition-all" type="number" defaultValue="9999" />
                <span className="text-[#F85149] text-[11px] font-medium mt-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm" data-icon="error">error</span>
                  Value exceeds threshold
                </span>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button className="px-[20px] py-[10px] bg-[#2F81F7] text-white font-semibold rounded-[8px] text-[14px] hover:scale-[1.02] hover:brightness-90 active:scale-[0.97] transition-all duration-150 shadow-lg shadow-primary/10" type="submit">
                  Deploy Changes
                </button>
                <button className="px-6 py-2.5 border border-outline-variant text-on-surface-variant font-medium rounded-md text-sm hover:bg-surface-container-high active:scale-95 transition-all" type="button">
                  Discard
                </button>
              </div>
              
              <div className="pt-4 border-t border-outline-variant/10 mt-6 flex flex-col">
                <label className="text-[#8B949E] text-[12px] font-medium uppercase tracking-wider mb-3">Danger Zone</label>
                <div className="flex">
                  <button className="px-[20px] py-[10px] bg-[#F85149] text-white font-semibold rounded-[8px] text-[14px] hover:scale-[1.02] hover:brightness-90 active:scale-[0.97] transition-all duration-150 flex items-center gap-2" type="button">
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete Node
                  </button>
                </div>
              </div>
            </form>
          </div>
          
          {/* Auxiliary Module */}
          <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-on-surface">Auto-Scaling Cluster</h3>
                <p className="text-xs text-on-surface-variant mt-1">Status: Operational. Currently 3 nodes active.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-tertiary"></div>
                <span className="text-xs font-mono text-on-surface-variant">SCALING_IDLE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: System Insights */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          
          {/* Status Card */}
          <div className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/20 relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors"></div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#58A6FF] mb-4">System Telemetry</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-sm text-on-surface-variant">CPU Utilization</span>
                <span className="text-lg font-mono font-bold text-on-surface">42.8%</span>
              </div>
              <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: '42.8%' }}></div>
              </div>
              
              <div className="flex justify-between items-end pt-2">
                <span className="text-sm text-on-surface-variant">Memory Footprint</span>
                <span className="text-lg font-mono font-bold text-on-surface">8.4 GB</span>
              </div>
              <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
                <div className="bg-secondary h-full rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>
          </div>

          {/* Visual Tech Graphic */}
          <div className="bg-[#10141a] rounded-xl overflow-hidden aspect-video relative border border-[#dfe2eb]/5">
            <img alt="Network Visualization" className="w-full h-full object-cover opacity-50" src="https://lh3.googleusercontent.com/aida-public/AB6AXuARhyxpDGy--TfyCdiWDTpayY7PHWTLF_aRB2s0F5DqRerK-h0GugiHw_A1QxcaZMT5UUof_7kYpGhIVk-qgLEW1Oyy2RoPeVPcWvvyG1vzIvxbne5_gQQtObm_hGEYIdmxEeAVJOYWZuxHijSBWqbCNb4YbKuhjcVa_iEgCTdzxFV7dafipLaCk0kThvYHb70Pl2ukCF3imt0sOalUL764JBgDnSEPa2Ml8GN_C1OPOhkdVN5L_y-90HCavpiBGQBFe0nkLe8Eng" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#10141a] to-transparent"></div>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-xs" data-icon="hub">hub</span>
                <span className="text-[10px] font-bold uppercase tracking-tighter text-[#58A6FF]">Active Grid View</span>
              </div>
              <p className="text-[11px] text-[#dfe2eb]/60 leading-tight">Visualizing real-time data packets between global edges.</p>
            </div>
          </div>

          {/* Documentation Link Card */}
          <a className="block p-5 bg-surface-container-low hover:bg-surface-container-high rounded-xl border border-outline-variant/10 transition-all group" href="#">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-background rounded-lg group-hover:bg-primary-container/20 transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary" data-icon="menu_book">menu_book</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-on-surface">Configuration Guide</h4>
                <p className="text-xs text-on-surface-variant mt-1">Read technical specs for enterprise node deployment.</p>
              </div>
            </div>
          </a>
        </div>
        
      </div>
    </div>
  );
}
