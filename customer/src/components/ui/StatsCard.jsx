export default function StatsCard({ title, value, hint, tone = "neutral" }) {
  const toneClass =
    tone === "success"
      ? "text-[#3FB950]"
      : tone === "warning"
      ? "text-[#E3B341]"
      : tone === "danger"
      ? "text-[#F85149]"
      : "text-[#E6EDF3]";

  return (
    <article className="rounded-xl border border-[#30363D] bg-[#161B22] p-5">
      <p className="text-xs uppercase tracking-wider text-[#8B949E]">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-[#8B949E]">{hint}</p>
    </article>
  );
}
