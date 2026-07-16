interface ActionBadgeProps {
  type: "추천" | "긴급";
}

export function ActionBadge({ type }: ActionBadgeProps) {
  const style =
    type === "추천"
      ? "linear-gradient(92deg, #429DDD -50.65%, #3AAEDD 121.87%)"
      : "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)";
  return (
    <span
      className="text-white text-[12px] font-[500] px-[15px] py-[3px] rounded-[15px]"
      style={{ background: style }}
    >
      {type}
    </span>
  );
}
