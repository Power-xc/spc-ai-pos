import { useState } from "react";
import { useStoreFilter } from "../../lib/StoreFilterContext";
import { STORE_LIST, REGIONS, QUICK_FILTER_STORES, getFilterLabel, type StoreFilter } from "../../lib/hqData";

export function StoreFilterBar() {
  const { filter, setFilter } = useStoreFilter();
  const [regionOpen, setRegionOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);

  const label = getFilterLabel(filter);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginRight: 4 }}>점포 필터</span>

      <button
        onClick={() => setFilter("all")}
        style={{
          height: 32,
          padding: "0 14px",
          borderRadius: 999,
          border: filter === "all" ? 0 : "1px solid #e7ebf3",
          background: filter === "all" ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
          color: filter === "all" ? "#fff" : "#374151",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: 12,
          transition: "all 0.15s",
        }}
      >
        전체 점포 ({STORE_LIST.length})
      </button>

      {QUICK_FILTER_STORES.map((name) => {
        const store = STORE_LIST.find((s) => s.store_name === name);
        if (!store) return null;
        const isActive = typeof filter === "object" && "storeId" in filter && filter.storeId === store.store_id;
        return (
          <button
            key={store.store_id}
            onClick={() => setFilter(isActive ? "all" : { storeId: store.store_id })}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 999,
              border: isActive ? 0 : "1px solid #e7ebf3",
              background: isActive ? "linear-gradient(135deg, #ff6e00, #e91e8c)" : "#fff",
              color: isActive ? "#fff" : "#374151",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 12,
              transition: "all 0.15s",
            }}
          >
            {name}
          </button>
        );
      })}

      <div style={{ position: "relative" }}>
        <button
          onClick={() => { setRegionOpen(!regionOpen); setStoreOpen(false); }}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid #e7ebf3",
            background: "#fff",
            color: "#374151",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          지역별 ▾
        </button>
        {regionOpen && (
          <div style={{
            position: "absolute", top: 36, left: 0, zIndex: 100,
            background: "#fff", border: "1px solid #e7ebf3", borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 8, minWidth: 160,
          }}>
            {REGIONS.map((region) => {
              const isActive = typeof filter === "object" && "region" in filter && filter.region === region;
              return (
                <button
                  key={region}
                  onClick={() => { setFilter(isActive ? "all" : { region }); setRegionOpen(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 12px", borderRadius: 8, border: 0,
                    background: isActive ? "#fff3e8" : "#fff",
                    color: isActive ? "#ff6e00" : "#374151",
                    fontWeight: isActive ? 800 : 600,
                    cursor: "pointer", fontSize: 13,
                  }}
                >
                  {region} ({STORE_LIST.filter((s) => s.region === region).length})
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <button
          onClick={() => { setStoreOpen(!storeOpen); setRegionOpen(false); }}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid #e7ebf3",
            background: "#fff",
            color: "#374151",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          점포 검색 ▾
        </button>
        {storeOpen && (
          <div style={{
            position: "absolute", top: 36, right: 0, zIndex: 100,
            background: "#fff", border: "1px solid #e7ebf3", borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 8, minWidth: 220,
            maxHeight: 320, overflowY: "auto",
          }}>
            {STORE_LIST.map((store) => {
              const isActive = typeof filter === "object" && "storeId" in filter && filter.storeId === store.store_id;
              return (
                <button
                  key={store.store_id}
                  onClick={() => { setFilter(isActive ? "all" : { storeId: store.store_id }); setStoreOpen(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "6px 10px", borderRadius: 8, border: 0,
                    background: isActive ? "#fff3e8" : "#fff",
                    color: isActive ? "#ff6e00" : "#374151",
                    fontWeight: isActive ? 800 : 500,
                    cursor: "pointer", fontSize: 12,
                  }}
                >
                  {store.store_name} <span style={{ color: "#9ca3af", fontSize: 10 }}>({store.region})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span style={{
        fontSize: 12, fontWeight: 700, color: "#ff6e00",
        padding: "4px 10px", borderRadius: 999,
        background: "#fff3e8", border: "1px solid rgba(255,110,0,0.2)",
      }}>
        {label}
      </span>
    </div>
  );
}