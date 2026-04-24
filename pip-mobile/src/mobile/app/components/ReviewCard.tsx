import type { ReviewData } from "@/mobile/types";
import { getReviewData } from "@/mobile/lib/api";
import { useFetchData } from "@/mobile/hooks/useFetchData";

interface ReviewCardProps {
  onViewAll?: () => void;
}

export default function ReviewCard({ onViewAll }: ReviewCardProps = {}) {
  const { data, loading } = useFetchData<ReviewData>(
    () => getReviewData(),
    { cacheKey: "getReviewData" },
  );

  if (loading || !data) return <div className="bg-white rounded-[20px] h-[160px] animate-pulse" />;

  const totalPercent = data.positivePercent + data.neutralPercent + data.negativePercent;

  return (
    <div className="bg-white border border-[#ebebeb] rounded-[20px] pb-[16px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-[20px] pt-[15px] pb-[12px]">
        <div className="flex items-center gap-[7px]">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
<path d="M11.255 5.09758L8.93415 7.10023L9.64124 10.0952C9.68025 10.2578 9.6702 10.4283 9.61237 10.5851C9.55453 10.742 9.4515 10.8782 9.31628 10.9766C9.18107 11.0749 9.01974 11.131 8.85268 11.1377C8.68562 11.1444 8.52031 11.1014 8.37765 11.0142L5.77312 9.4113L3.16705 11.0142C3.02441 11.1009 2.8593 11.1435 2.69253 11.1365C2.52575 11.1296 2.36476 11.0734 2.22983 10.9752C2.0949 10.8769 1.99206 10.7409 1.93426 10.5843C1.87646 10.4277 1.86628 10.2575 1.90501 10.0952L2.61468 7.10023L0.293816 5.09758C0.167611 4.98851 0.0763373 4.84467 0.0313937 4.68403C-0.0135499 4.52339 -0.0101716 4.35307 0.0411066 4.19434C0.0923847 4.03561 0.18929 3.8955 0.319721 3.79152C0.450152 3.68753 0.608327 3.62428 0.774493 3.60965L3.81741 3.36415L4.99125 0.523413C5.05479 0.368594 5.16293 0.236166 5.30192 0.142965C5.44092 0.049764 5.60449 0 5.77184 0C5.93918 0 6.10275 0.049764 6.24175 0.142965C6.38074 0.236166 6.48888 0.368594 6.55242 0.523413L7.72575 3.36415L10.7687 3.60965C10.9352 3.62373 11.0938 3.68663 11.2247 3.79047C11.3556 3.89432 11.453 4.03448 11.5046 4.1934C11.5562 4.35233 11.5597 4.52294 11.5148 4.68388C11.4698 4.84481 11.3784 4.9889 11.2519 5.0981L11.255 5.09758Z" fill="#555555"/>
</svg>
          <span className="text-[#555] text-[14px] font-bold">리뷰 현황</span>
        </div>
        <button type="button" onClick={onViewAll} className="flex items-center gap-[6px] cursor-pointer">
          <span className="text-[#3babdd] text-[12px] font-[500]">전체 보기</span>
          <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
            <path d="M1 1L5 5.5L1 10" stroke="#3babdd" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 스탯 3개 */}
      <div className="flex gap-[8px] px-[20px] mb-[12px]">
        {/* 평균 별점 */}
        <div className="flex-1 bg-[#f6f7f9] rounded-[20px] py-[10px] flex flex-col items-center gap-[4px]">
          <div className="flex items-center gap-[4px]">
            <span className="text-black text-[16px] font-bold">{data.averageRating}</span>
            <svg width="9" height="8" viewBox="0 0 9 8" fill="none">
              <path d="M4.5 0L5.5 3H9L6.5 4.8L7.5 8L4.5 6L1.5 8L2.5 4.8L0 3H3.5L4.5 0Z" fill="#FFB800" />
            </svg>
          </div>
          <span className="text-[#333] text-[10px]">평균 별점</span>
        </div>
        {/* 총 리뷰 수 */}
        <div className="flex-1 bg-[#f6f7f9] rounded-[20px] py-[10px] flex flex-col items-center gap-[4px]">
          <span className="text-black text-[16px] font-bold">{data.totalReviews}</span>
          <span className="text-[#333] text-[10px]">총 리뷰</span>
        </div>
        {/* 응답률 */}
        <div className="flex-1 bg-[#f6f7f9] rounded-[20px] py-[10px] flex flex-col items-center gap-[4px]">
          <span className="text-black text-[16px] font-bold">{data.responseRate} %</span>
          <span className="text-[#333] text-[10px]">응답률</span>
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="px-[20px] mb-[8px]">
        <div className="flex rounded-[100px] overflow-hidden h-[10px] gap-[5px]">
          <div
            className="h-full rounded-[100px]"
            style={{
              width: `${(data.positivePercent / totalPercent) * 100}%`,
              background: "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
            }}
          />
          <div
            className="h-full rounded-[100px]"
            style={{ width: `${(data.neutralPercent / totalPercent) * 100}%`,
          background:"linear-gradient(0deg, #FED400 0%, #FED400 100%), linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%), linear-gradient(92deg, #429DDD -50.65%, #3AAEDD 121.87%)" }}
          />
          <div
            className="h-full bg-[#f85f34] rounded-[100px]"
            style={{ width: `${(data.negativePercent / totalPercent) * 100}%` }}
          />
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center justify-between gap-[20px] px-[20px]">
        <div className="flex items-center gap-[6px]">
          <div
            className="w-[9px] h-[5px] rounded-[30px]"
            style={{ background: "linear-gradient(94deg, #3faf60 50%, #3aaedd 121%)" }}
          />
          <span className="text-[#555] text-[10px] font-bold">
            긍정 <span className="text-black">{data.positivePercent}</span>
            <span className="font-normal"> %</span>
          </span>
        </div>
        <div className="flex items-center gap-[6px]">
          <div className="w-[9px] h-[5px] rounded-[30px] bg-[#fed400]" />
          <span className="text-[#555] text-[10px] font-bold">
            혼잡 <span className="text-black">{data.neutralPercent}</span>
            <span className="font-normal"> %</span>
          </span>
        </div>
        <div className="flex items-center gap-[6px]">
          <div className="w-[9px] h-[5px] rounded-[30px] bg-[#f85f34]" />
          <span className="text-[#555] text-[10px] font-bold">
            부정 <span className="text-black">{data.negativePercent}</span>
            <span className="font-normal"> %</span>
          </span>
        </div>
      </div>
    </div>
  );
}
