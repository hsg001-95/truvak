export default function FormInput({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
}) {
  return (
    <label htmlFor={id} className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-[#8B949E]">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#30363D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] placeholder:text-[#8B949E] focus:border-[#2F81F7] focus:outline-none"
      />
    </label>
  );
}
