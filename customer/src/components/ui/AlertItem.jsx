export default function AlertItem({ title, subtitle, onClick, tone = "danger" }) {
  const toneClass = tone === "danger" ? "border-[#F85149]/40 bg-[#F85149]/10" : "border-[#30363D] bg-[#161B22]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start justify-between rounded-lg border p-3 text-left transition hover:border-[#2F81F7] ${toneClass}`}
    >
      <div>
        <p className="text-sm font-semibold text-[#E6EDF3]">{title}</p>
        <p className="text-xs text-[#8B949E]">{subtitle}</p>
      </div>
      <span className="text-xs text-[#8B949E]">View</span>
    </button>
  );
}
