import type { ReactNode } from "react";

interface CardHeaderProps {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
  paddingBottom?: string;
}

export function CardHeader({ icon, title, right, paddingBottom = "pb-[12px]" }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between px-[20px] pt-[15px] ${paddingBottom}`}>
      <div className="flex items-center gap-[7px]">
        {icon}
        <span className="text-[#555] text-[14px] font-bold leading-[20px]">{title}</span>
      </div>
      {right && <div className="flex items-center">{right}</div>}
    </div>
  );
}
