import React, { useState, useEffect } from "react";
import OverviewSkeleton from "../components/ui/OverviewSkeleton";

export default function Overview() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate real backend bootstrapping delay
    const timer = setTimeout(() => setIsLoading(false), 2500); 
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Row 1: StatsCards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 hover:bg-surface-container-high transition-colors duration-150">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">Total Revenue</span>
            <span className="material-symbols-outlined text-primary text-lg">payments</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">$1,284,500</div>
          <div className="flex items-center gap-1 mt-2 text-xs text-primary">
            <span className="material-symbols-outlined text-sm">trending_up</span>
            <span>+12.4% vs last month</span>
          </div>
        </div>
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 hover:bg-surface-container-high transition-colors duration-150">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">Active Orders</span>
            <span className="material-symbols-outlined text-tertiary text-lg">shopping_cart</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">3,492</div>
          <div className="flex items-center gap-1 mt-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm">sync</span>
            <span>84 processing</span>
          </div>
        </div>
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 hover:bg-surface-container-high transition-colors duration-150">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">Platform Load</span>
            <span className="material-symbols-outlined text-secondary text-lg">speed</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">42.8%</div>
          <div className="flex items-center gap-1 mt-2 text-xs text-secondary">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>Optimized state</span>
          </div>
        </div>
        <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 hover:bg-surface-container-high transition-colors duration-150">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">Error Rate</span>
            <span className="material-symbols-outlined text-error text-lg">warning</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">0.04%</div>
          <div className="flex items-center gap-1 mt-2 text-xs text-error">
            <span className="material-symbols-outlined text-sm">trending_down</span>
            <span>-0.02% lower</span>
          </div>
        </div>
      </div>

      {/* Row 2: ChartContainers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engine Overview */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-[12px] p-5 flex flex-col h-[340px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-white text-[16px] font-semibold">Engine Overview</h3>
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#262a31]">
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(88,166,255,0.6)]"></span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-primary">System Nominal</span>
            </div>
          </div>
          <div className="flex-grow rounded-lg chart-grid relative overflow-hidden bg-surface-container-lowest/50 border border-[#30363D]/40">
            {/* Abstract Node Visualization Placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-full flex items-center justify-center p-8">
                <div className="relative w-full h-full border border-primary/10 rounded-full flex items-center justify-center">
                  <div className="absolute w-[60%] h-[60%] border border-primary/20 rounded-full animate-pulse"></div>
                  <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center border border-primary/40 backdrop-blur-md">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>hub</span>
                  </div>
                  {/* Decorative nodes */}
                  <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-primary rounded-full"></div>
                  <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-secondary rounded-full opacity-60"></div>
                  <div className="absolute bottom-1/4 left-1/2 w-4 h-4 bg-primary/40 rounded-full"></div>
                </div>
              </div>
            </div>
            <div className="absolute bottom-3 left-3 flex flex-col gap-1">
              <span className="text-[10px] font-mono text-on-surface-variant/60">NODE_LATENCY: 4ms</span>
              <span className="text-[10px] font-mono text-on-surface-variant/60">THROUGHPUT: 1.2GB/s</span>
            </div>
          </div>
        </div>

        {/* Cluster Health */}
        <div className="bg-[#161B22] border border-[#30363D] rounded-[12px] p-5 flex flex-col h-[340px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-white text-[16px] font-semibold">Cluster Health</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-white transition-colors">more_vert</button>
          </div>
          <div className="space-y-8 flex-grow flex flex-col justify-center">
            {/* CPU Usage */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">CPU Usage</span>
                <span className="text-lg font-bold text-on-surface">64.2%</span>
              </div>
              <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full" style={{ width: '64.2%' }}></div>
              </div>
            </div>
            {/* Memory Allocation */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Memory Allocation</span>
                <span className="text-lg font-bold text-on-surface">82.1%</span>
              </div>
              <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-tertiary to-tertiary-container rounded-full" style={{ width: '82.1%' }}></div>
              </div>
            </div>
            {/* Storage Latency */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Storage Latency</span>
                <span className="text-lg font-bold text-on-surface">12ms</span>
              </div>
              <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-secondary to-secondary-container rounded-full" style={{ width: '35%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Active Deployments Table */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
          <h3 className="text-lg font-bold text-on-surface">Active Deployments</h3>
          <div className="flex gap-2">
            <button className="px-3 py-1 text-xs font-semibold bg-surface-container-high rounded border border-outline-variant/30 text-on-surface hover:bg-surface-bright transition-colors">Export Logs</button>
            <button className="px-3 py-1 text-xs font-semibold bg-primary text-on-primary-fixed rounded hover:opacity-90 transition-opacity">Deploy New</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest/50">
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Target Instance</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Namespace</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Uptime</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Traffic</th>
                <th className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              <tr className="hover:bg-surface-bright/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-sm">dns</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-on-surface">core-api-v2-west</span>
                      <span className="text-[10px] font-mono text-on-surface-variant">#hash-f2d3</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-on-surface">production-env</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-on-surface">14d 6h 22m</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-on-surface font-mono">4.2k req/s</span>
                    <div className="w-24 h-1 bg-surface-container-highest rounded-full">
                      <div className="w-3/4 h-full bg-primary rounded-full"></div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">Operational</span>
                </td>
              </tr>
              <tr className="hover:bg-surface-bright/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-secondary/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-secondary text-sm">database</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-on-surface">redis-cache-cluster</span>
                      <span className="text-[10px] font-mono text-on-surface-variant">#hash-7a1b</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-on-surface">staging-env</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-on-surface">2d 18h 05m</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-on-surface font-mono">18.9k req/s</span>
                    <div className="w-24 h-1 bg-surface-container-highest rounded-full">
                      <div className="w-1/2 h-full bg-secondary rounded-full"></div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-tertiary/10 text-tertiary border border-tertiary/20">Degraded</span>
                </td>
              </tr>
              <tr className="hover:bg-surface-bright/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-surface-variant text-sm">terminal</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-on-surface">batch-worker-node-1</span>
                      <span className="text-[10px] font-mono text-on-surface-variant">#hash-4c22</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-on-surface">production-env</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-on-surface">31d 0h 14m</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-on-surface font-mono">142 req/s</span>
                    <div className="w-24 h-1 bg-surface-container-highest rounded-full">
                      <div className="w-1/5 h-full bg-on-surface-variant rounded-full"></div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">Operational</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
