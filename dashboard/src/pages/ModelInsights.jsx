export default function ModelInsights() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold border-b border-dark-border pb-4">🔬 Model Performance Insights</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-dark-paper border border-dark-border rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Baseline Model Comparison</h3>
          <div className="overflow-x-auto">
            <table className="table-container text-xs">
              <thead>
                <tr>
                  <th className="table-header">Model</th>
                  <th className="table-header">AUC</th>
                  <th className="table-header">F1 Score</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-dark-grid">
                  <td className="table-cell">Logistic Regression</td>
                  <td className="table-cell">0.757</td>
                  <td className="table-cell">0.315</td>
                </tr>
                <tr className="hover:bg-dark-grid">
                  <td className="table-cell">Random Forest ✓</td>
                  <td className="table-cell text-brand-green font-bold">0.754</td>
                  <td className="table-cell text-brand-green font-bold">0.316</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-dark-paper border border-dark-border rounded-xl p-6 flex flex-col items-center justify-center text-center">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-brand-muted text-sm">Visual metrics (AUC ROC, Confusion Matrix) correspond to standard backend inference validation outputs.</div>
        </div>
      </div>
      
      <div className="bg-dark-paper border border-dark-border rounded-xl p-6 mt-6">
        <h3 className="text-lg font-bold mb-4 border-b border-dark-grid pb-2">Dataset Summary & Engineering</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
           <div>
             <div className="text-[11px] uppercase tracking-wider text-brand-muted mb-1 font-semibold">Source</div>
             <div className="text-sm font-bold">Olist + Census 2011</div>
           </div>
           <div>
             <div className="text-[11px] uppercase tracking-wider text-brand-muted mb-1 font-semibold">Records</div>
             <div className="text-sm font-bold">97,916</div>
           </div>
        </div>
      </div>
    </div>
  );
}
