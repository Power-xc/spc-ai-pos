import { createContext, useContext, useState, type ReactNode } from "react";
import type { StoreFilter } from "./hqData";

interface StoreFilterContextValue {
  filter: StoreFilter;
  setFilter: (f: StoreFilter) => void;
}

const StoreFilterContext = createContext<StoreFilterContextValue>({
  filter: "all",
  setFilter: () => {},
});

export function StoreFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<StoreFilter>("all");
  return (
    <StoreFilterContext.Provider value={{ filter, setFilter }}>
      {children}
    </StoreFilterContext.Provider>
  );
}

export function useStoreFilter() {
  return useContext(StoreFilterContext);
}