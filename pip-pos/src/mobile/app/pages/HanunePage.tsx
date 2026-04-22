import PipAiCard from "../components/PipAiCard";
import TodoShortcut from "../components/TodoShortcut";
import DailySalesCard from "../components/DailySalesCard";
import AiActionCard from "../components/AiActionCard";
import EventScheduleCard from "../components/EventScheduleCard";
import ReviewCard from "../components/ReviewCard";
import KakaoReportButton from "../components/KakaoReportButton";

export default function HanunePage() {
  return (
    <div className="px-[15px] pt-[12px] flex flex-col gap-[12px]">
      <PipAiCard />
      <TodoShortcut />
      <DailySalesCard />
      <AiActionCard />
      <EventScheduleCard />
      <ReviewCard />
      <KakaoReportButton />
    </div>
  );
}
