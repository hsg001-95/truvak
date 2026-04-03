export default function ModelInsights() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <h1 className="text-2xl font-bold border-b border-outline-variant/10 pb-4 text-on-surface">🔬 Model Performance Insights</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4 text-on-surface">Baseline Model Comparison</h3>
          <div className="overflow-x-auto rounded-lg border border-outline-variant/10">
            <table className="w-full border-collapse text-sm bg-[#1c2026]">
              <thead>
                <tr>
                  <th className="text-[11px] text-on-surface-variant font-medium text-left px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">Model</th>
                  <th className="text-[11px] text-on-surface-variant font-medium text-left px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">AUC</th>
                  <th className="text-[11px] text-on-surface-variant font-medium text-left px-4 py-3 border-b border-outline-variant/10 uppercase tracking-widest bg-surface-container-highest">F1 Score</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-surface-bright/20 transition-colors">
                  <td className="px-4 py-4 border-b border-outline-variant/5 text-on-surface">Logistic Regression</td>
                  <td className="px-4 py-4 border-b border-outline-variant/5 text-on-surface">0.757</td>
                  <td className="px-4 py-4 border-b border-outline-variant/5 text-on-surface">0.315</td>
                </tr>
                <tr className="hover:bg-surface-bright/20 transition-colors">
                  <td className="px-4 py-4 text-on-surface">Random Forest ✓</td>
                  <td className="px-4 py-4 text-primary font-bold">0.754</td>
                  <td className="px-4 py-4 text-primary font-bold">0.316</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6 flex flex-col items-center justify-center text-center">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-on-surface-variant text-sm">Visual metrics (AUC ROC, Confusion Matrix) correspond to standard backend inference validation outputs.</div>
        </div>
      </div>
      
      <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl p-6 mt-6">
        <h3 className="text-lg font-bold mb-4 border-b border-outline-variant/10 pb-2 text-on-surface">Dataset Summary & Engineering</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
           <div>
             <div className="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">Source</div>
             <div className="text-sm font-bold text-on-surface">Olist + Census 2011</div>
           </div>
           <div>
             <div className="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">Records</div>
             <div className="text-sm font-bold text-on-surface">97,916</div>
           </div>
        </div>
      </div>
    </div>
  );
}
