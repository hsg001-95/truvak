export default function ChartContainer({ title, children }) {
  return (
    <section className="rounded-xl border border-[#30363D] bg-[#161B22] p-5">
      <h3 className="text-sm font-semibold text-[#E6EDF3]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}
