type ActionCardProps = {
  emoji: string;
  title: string;
  subtitle: string;
  backgroundColor: string;
};

export function ActionCard({
  emoji,
  title,
  subtitle,
  backgroundColor,
}: ActionCardProps) {
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center gap-2 rounded-[22px] p-6 text-center shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
      style={{ backgroundColor }}
    >
      <span className="text-5xl leading-none" role="img" aria-hidden="true">
        {emoji}
      </span>
      <h3 className="text-lg font-bold text-[#4A3F5C]">{title}</h3>
      <p className="text-sm text-[#8B7FA0]">{subtitle}</p>
    </button>
  );
}
