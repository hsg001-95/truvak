export default function ActionButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  className = "",
}) {
  const variantClass =
    variant === "secondary"
      ? "border border-[#30363D] bg-transparent text-[#E6EDF3] hover:bg-[#161B22]"
      : "bg-[#2F81F7] text-[#E6EDF3] hover:bg-[#1f6fe0]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
    >
      {children}
    </button>
  );
}
