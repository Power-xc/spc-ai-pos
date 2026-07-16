import home from "./ico-home.svg";
import homeOv from "./ico-home_ov.svg";
import realtime from "./ico-realtime.svg";
import realtimeOv from "./ico-realtime_ov.svg";
import todo from "./ico-todo.svg";
import todoOv from "./ico-todo_ov.svg";
import order from "./ico-Order.svg";
import orderOv from "./ico-Order_ov.svg";
import promotions from "./ico-promotions.svg";
import promotionsOv from "./ico-promotions_ov.svg";
import analysis from "./ico-analysis.svg";
import analysisOv from "./ico-analysis_ov.svg";
import verification from "./ico-verification.svg";
import verificationOv from "./ico-verification_ov.svg";
import marking from "./ico-marking.svg";
import markingOv from "./ico-marking_ov.svg";
import alarm from "./ico-alarm.svg";
import alarmOv from "./ico-alarm_ov.svg";

export const sidebarIcons: Record<string, { default: string; active: string }> =
  {
    "종합 현황": { default: home, active: homeOv },
    "AI 실시간 현황": { default: realtime, active: realtimeOv },
    "생산관리": { default: todo, active: todoOv },
    "발주 관리": { default: order, active: orderOv },
    프로모션: { default: promotions, active: promotionsOv },
    "AI 기반 성과 분석": { default: analysis, active: analysisOv },
    "AI 검증": { default: verification, active: verificationOv },
    벤치마킹: { default: marking, active: markingOv },
    "알람 설정": { default: alarm, active: alarmOv },
  };
