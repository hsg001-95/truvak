export default function SkeletonLoader({ rows = 2, className = "" }) {
  return (
    <div className={`animate-pulse space-y-4 ${className}`}>
      <div className="h-8 w-1/3 rounded-lg bg-[#161B22]" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-24 rounded-lg bg-[#161B22]" />
      ))}
    </div>
  );
}
