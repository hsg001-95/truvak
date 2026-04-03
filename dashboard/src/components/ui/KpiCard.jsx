export default function KpiCard({ title, value, delta, status, subtext }) {
  const statusColors = {
    green: "metric-card-green",
    blue: "metric-card-blue",
    amber: "metric-card-amber",
    red: "metric-card-red",
  };

  const deltaColors = {
    pos: "kpi-delta-pos",
    neg: "kpi-delta-neg",
    neu: "kpi-delta-neu",
  };

  return (
    <div className={statusColors[status] || "metric-card"}>
      <div>
        <div className="kpi-label">{title}</div>
        <div className="kpi-value">{value}</div>
      </div>
      <div className={deltaColors[delta] || "kpi-delta-neu"}>{subtext}</div>
    </div>
  );
}
