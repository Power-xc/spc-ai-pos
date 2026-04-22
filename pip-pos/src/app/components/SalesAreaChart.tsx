// @ts-nocheck
// recharts v2 와 @types/react v19 의 타입 충돌을 이 파일에서만 격리합니다.
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { SalesHourlyPoint } from "../../types";

interface Props {
  data: SalesHourlyPoint[];
  formatKRW: (val: number) => string;
}

export default function SalesAreaChart({ data, formatKRW }: Props) {
  const maxVal = Math.max(...data.map((d) => d.value));
  const peakTime = data.find((d) => d.value === maxVal)?.time ?? "";

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1E1B39] text-white text-[7px] font-semibold px-[8px] py-[4px] rounded-[6px] leading-tight shadow-xl">
          <div className="opacity-60 mb-[2px]">{label}</div>
          <div>{formatKRW(payload[0].value)}</div>
        </div>
      );
    }
    return null;
  };

  const PeakDot = (props) => {
    const { cx = 0, cy = 0, payload } = props;
    if (payload?.time !== peakTime) return null;
    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={5}
          fill="white"
          stroke="#3BB1E1"
          strokeWidth={1.5}
        />
        <circle cx={cx} cy={cy} r={2.5} fill="#3BB1E1" />
      </g>
    );
  };

  return (
    <div className="px-[8px]" style={{ height: 85, minWidth: 200 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={60}>
        <AreaChart
          data={data}
          margin={{ top: 18, right: 20, left: 20, bottom: 20 }}
        >
          <defs>
            <linearGradient id="snapGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3BB1E1" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#3BB1E1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 6.5, fill: "#615E83", letterSpacing: 0.3 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            ticks={["08:00", "10:00", "13:00", "16:00", "18:00"]}
          />
          <YAxis hide domain={["auto", "auto"]} />
          <ReferenceLine
            x={peakTime}
            stroke="#3BB1E1"
            strokeWidth={0.8}
            strokeDasharray="2 2"
            opacity={0.6}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3BB1E1"
            strokeWidth={1.5}
            fill="url(#snapGrad)"
            dot={<PeakDot />}
            activeDot={{
              r: 4,
              fill: "#3BB1E1",
              stroke: "white",
              strokeWidth: 1.5,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
