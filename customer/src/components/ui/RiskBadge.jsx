export default function RiskBadge({ label }) {
  const normalized = (label || "").toUpperCase();
  const className =
    normalized === "TRUSTED" || normalized === "HEALTHY"
      ? "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]"
      : normalized === "MODERATE" || normalized === "NEUTRAL"
      ? "border-[#E3B341]/40 bg-[#E3B341]/10 text-[#E3B341]"
      : "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${className}`}>
      {normalized || "UNKNOWN"}
    </span>
  );
}
