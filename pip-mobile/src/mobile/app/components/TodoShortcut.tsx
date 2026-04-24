import todo from "../../assets/ico-todo.svg";

interface TodoShortcutProps {
  onNavigate?: (tab: string) => void;
}

export default function TodoShortcut({ onNavigate }: TodoShortcutProps = {}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.("할일 바로가기")}
      className="w-full flex items-center justify-between px-[20px] py-[6px] rounded-[20px] text-white cursor-pointer"
      style={{ background: "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%), #FFF" }}
    >
      <div className="flex items-center gap-[8px]">
        <img src={todo} alt="" />
        <span className="text-[14px] font-bold leading-[21px]">할일 바로가기</span>
      </div>
      <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
        <path d="M1 1L5 5.5L1 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
