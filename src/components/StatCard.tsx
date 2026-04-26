type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down" | "neutral";
};

export function StatCard({
  label,
  value,
  detail,
  trend = "neutral"
}: StatCardProps) {
  return (
    <article className={`stat-card stat-${trend}`}>
      <p className="stat-label">{label}</p>
      <strong className="stat-value">{value}</strong>
      <p className="stat-detail">{detail}</p>
    </article>
  );
}
