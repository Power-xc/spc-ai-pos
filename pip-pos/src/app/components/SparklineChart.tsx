// @ts-nocheck
// recharts v3 와 @types/react v19 의 타입 충돌을 이 파일에서만 격리합니다.
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface Props {
  data: number[];
  color: string;
  gradientId: string;
}

export default function SparklineChart({ data, color, gradientId }: Props) {
  return (
    <ResponsiveContainer width="100%" height={28} minWidth={60} minHeight={20}>
      <AreaChart
        data={data.map((v) => ({ v }))}
        margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
