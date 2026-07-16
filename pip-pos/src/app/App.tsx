import Frame from "../imports/Frame1";

export default function App() {
  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, #cdd1d8 0%, #b8bdc6 60%, #a8adb8 100%)",
      }}
    >
      <div className="flex flex-col items-center py-10">
        {/* ── Monitor body ── */}
        <div
          className="rounded-[22px] p-[18px] pb-[14px]"
          style={{
            background:
              "linear-gradient(160deg, #35393f 0%, #22252c 60%, #1c1f25 100%)",
            boxShadow:
              "0 30px 90px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
            border: "1.5px solid #3e4249",
          }}
        >
          {/* ── Screw decorations (top corners) ── */}
          <div className="relative">
            <div
              className="absolute top-[-6px] left-[4px] size-[8px] rounded-full"
              style={{ background: "#2a2d33", border: "1px solid #444" }}
            />
            <div
              className="absolute top-[-6px] right-[4px] size-[8px] rounded-full"
              style={{ background: "#2a2d33", border: "1px solid #444" }}
            />

            {/* ── Screen glass effect ── */}
            <div
              className="rounded-[10px] overflow-hidden"
              style={{
                boxShadow:
                  "inset 0 3px 10px rgba(0,0,0,0.75), inset 0 -1px 4px rgba(0,0,0,0.4)",
              }}
            >
              {/* Glass glare strip */}
              <div
                className="absolute top-0 left-0 right-0 h-[60px] pointer-events-none z-10 rounded-t-[10px]"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)",
                }}
              />
              <Frame />
            </div>
          </div>

          {/* ── Bottom brand bar ── */}
          <div className="flex items-center justify-between mt-[12px] px-[6px]">
            {/* Left: status LED */}
            <div className="flex items-center gap-[6px]">
              <div
                className="size-[6px] rounded-full"
                style={{
                  background: "#3faf60",
                  boxShadow: "0 0 6px rgba(63,175,96,0.8)",
                }}
              />
              <span
                style={{
                  color: "#44474f",
                  fontSize: "9px",
                  letterSpacing: "0.05em",
                }}
              >
                ONLINE
              </span>
            </div>

            {/* Center: brand name */}
            <div className="flex items-center gap-[8px]">
              <div
                className="h-[1px] w-[30px]"
                style={{ background: "#3a3d44" }}
              />
              <span
                style={{
                  color: "#555860",
                  fontSize: "9px",
                  letterSpacing: "0.3em",
                  fontWeight: 500,
                }}
              >
                BR KOREA POS SYSTEM
              </span>
              <div
                className="h-[1px] w-[30px]"
                style={{ background: "#3a3d44" }}
              />
            </div>

            {/* Right: power button */}
            <div className="flex items-center gap-[6px]">
              <span
                style={{
                  color: "#44474f",
                  fontSize: "9px",
                  letterSpacing: "0.05em",
                }}
              >
                PWR
              </span>
              <div
                className="size-[10px] rounded-full flex items-center justify-center"
                style={{
                  background: "#2a2d33",
                  border: "1px solid #4a4d55",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
                }}
              >
                <div
                  className="size-[4px] rounded-full"
                  style={{ background: "#556080" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Stand neck ── */}
        <div
          className="relative"
          style={{ width: "60px", height: "72px", marginTop: "-2px" }}
        >
          {/* Main neck */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, #2c3038 0%, #22262c 50%, #1c2026 100%)",
              clipPath: "polygon(22% 0%, 78% 0%, 88% 100%, 12% 100%)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          />
          {/* Neck highlight */}
          <div
            className="absolute"
            style={{
              top: 0,
              left: "30%",
              width: "8%",
              height: "100%",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)",
              clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
            }}
          />
        </div>

        {/* ── Stand base ── */}
        <div
          className="rounded-[12px]"
          style={{
            width: "340px",
            height: "22px",
            background:
              "linear-gradient(180deg, #2c3038 0%, #1e2228 60%, #181b20 100%)",
            boxShadow:
              "0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
            border: "1px solid #2a2d33",
          }}
        />

        {/* ── Base shadow on surface ── */}
        <div
          className="rounded-full mt-[6px]"
          style={{
            width: "380px",
            height: "12px",
            background: "rgba(0,0,0,0.18)",
            filter: "blur(8px)",
          }}
        />
      </div>
    </div>
  );
}
