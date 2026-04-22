export interface StoreMaster {
  store_id: string;
  store_name: string;
  region: string;
  city: string;
  center: string;
  annual_sales: number | null;
  campaign_share: number;
  store_type: string;
  biz_type: string;
  area_pyeong: number;
}

export const STORE_LIST: StoreMaster[] = [
  { store_id: "POC_001", store_name: "고양시02", region: "경기도", city: "고양시", center: "안양", annual_sales: 207483000, campaign_share: 0.000, store_type: "단독매장", biz_type: "도너츠/음식업", area_pyeong: 66 },
  { store_id: "POC_002", store_name: "영등포구01", region: "서울특별시", city: "영등포구", center: "안양", annual_sales: 547715000, campaign_share: 0.000, store_type: "단독매장", biz_type: "도너츠,빵,커피류등/음식", area_pyeong: 231 },
  { store_id: "POC_003", store_name: "노원구01", region: "서울특별시", city: "노원구", center: "안양", annual_sales: 242405000, campaign_share: 0.024, store_type: "단독매장", biz_type: "제과점업/음식", area_pyeong: 0 },
  { store_id: "POC_004", store_name: "해운대구01", region: "부산광역시", city: "해운대구", center: "김해센터", annual_sales: 357542000, campaign_share: 0.030, store_type: "단독매장", biz_type: "제과/음식", area_pyeong: 0 },
  { store_id: "POC_005", store_name: "김천시01", region: "경상북도", city: "김천시", center: "신탄진", annual_sales: 518539000, campaign_share: 0.000, store_type: "단독매장", biz_type: "도넛 등/음식점업", area_pyeong: 0 },
  { store_id: "POC_006", store_name: "동구01", region: "대구광역시", city: "동구", center: "김해센터", annual_sales: 960090000, campaign_share: 0.000, store_type: "단독매장", biz_type: "판매대리(휴게음식점)/소매업", area_pyeong: 0 },
  { store_id: "POC_007", store_name: "강릉시01", region: "강원도", city: "강릉시", center: "원주센터", annual_sales: 752109000, campaign_share: 0.032, store_type: "단독매장", biz_type: "도너츠/음식점업", area_pyeong: 0 },
  { store_id: "POC_008", store_name: "연제구01", region: "부산광역시", city: "연제구", center: "김해센터", annual_sales: 292288000, campaign_share: 0.099, store_type: "단독매장", biz_type: "음식/제과", area_pyeong: 0 },
  { store_id: "POC_009", store_name: "마포구02", region: "서울특별시", city: "마포구", center: "안양", annual_sales: 616984000, campaign_share: 0.048, store_type: "단독매장", biz_type: "도넛,커피/음식", area_pyeong: 0 },
  { store_id: "POC_010", store_name: "강서구01", region: "서울특별시", city: "강서구", center: "안양", annual_sales: 486004000, campaign_share: 0.020, store_type: "단독매장", biz_type: "도넛,커피/휴게음식점", area_pyeong: 0 },
  { store_id: "POC_011", store_name: "안양시01", region: "경기도", city: "안양시", center: "안양", annual_sales: 659566000, campaign_share: 0.014, store_type: "단독매장", biz_type: "도너츠/휴게음식점", area_pyeong: 0 },
  { store_id: "POC_012", store_name: "마포구01", region: "서울특별시", city: "마포구", center: "안양", annual_sales: 1042680000, campaign_share: 0.026, store_type: "단독매장", biz_type: "휴게음식점/음식점업", area_pyeong: 0 },
  { store_id: "POC_013", store_name: "용인시01", region: "경기도", city: "용인시", center: "안양", annual_sales: 459996000, campaign_share: 0.030, store_type: "단독매장", biz_type: "휴게음식점/음식점업", area_pyeong: 0 },
  { store_id: "POC_014", store_name: "중구01", region: "대구광역시", city: "중구", center: "신탄진", annual_sales: 473958000, campaign_share: 0.037, store_type: "단독매장", biz_type: "도너츠,커피/음식점", area_pyeong: 0 },
  { store_id: "POC_015", store_name: "포항시01", region: "경상북도", city: "포항시", center: "신탄진", annual_sales: 634780000, campaign_share: 0.079, store_type: "단독매장", biz_type: "휴게음식점/음식점업", area_pyeong: 0 },
  { store_id: "POC_016", store_name: "영등포구02", region: "서울특별시", city: "영등포구", center: "안양", annual_sales: 335467000, campaign_share: 0.031, store_type: "단독매장", biz_type: "휴게음식/음식점", area_pyeong: 0 },
  { store_id: "POC_017", store_name: "천안시01", region: "충청남도", city: "천안시", center: "신탄진", annual_sales: 382945000, campaign_share: 0.000, store_type: "단독매장", biz_type: "휴게음식점/음식점업", area_pyeong: 0 },
  { store_id: "POC_018", store_name: "시흥시01", region: "경기도", city: "시흥시", center: "안양", annual_sales: 440833000, campaign_share: 0.077, store_type: "단독매장", biz_type: "휴게음식점(도너츠,커피)/음식점업", area_pyeong: 0 },
  { store_id: "POC_019", store_name: "부산진구01", region: "부산광역시", city: "부산진구", center: "김해센터", annual_sales: 853315000, campaign_share: 0.086, store_type: "단독매장", biz_type: "제과,커피/음식", area_pyeong: 0 },
  { store_id: "POC_020", store_name: "강남구01", region: "서울특별시", city: "강남구", center: "안양", annual_sales: 832045000, campaign_share: 0.000, store_type: "단독매장", biz_type: "상품대리/도매 및 소매업", area_pyeong: 0 },
  { store_id: "POC_021", store_name: "경산시01", region: "경상북도", city: "경산시", center: "신탄진", annual_sales: 422762000, campaign_share: 0.000, store_type: "단독매장", biz_type: "도너츠 및 음료/도매 및 소매업", area_pyeong: 0 },
  { store_id: "POC_022", store_name: "서구01", region: "인천광역시", city: "서구", center: "안양", annual_sales: 462140000, campaign_share: 0.071, store_type: "단독매장", biz_type: "제과점업/숙박 및 음식점업", area_pyeong: 0 },
  { store_id: "POC_023", store_name: "춘천시01", region: "강원도", city: "춘천시", center: "원주센터", annual_sales: 473452000, campaign_share: 0.013, store_type: "단독매장", biz_type: "도너츠,커피/음식점업", area_pyeong: 0 },
  { store_id: "POC_024", store_name: "나주시01", region: "전라남도", city: "나주시", center: "광주센터", annual_sales: 516688000, campaign_share: 0.011, store_type: "단독매장", biz_type: "음식점위수탁업/도매 및 소매업", area_pyeong: 0 },
  { store_id: "POC_025", store_name: "익산시01", region: "전라북도", city: "익산시", center: "광주센터", annual_sales: 879094000, campaign_share: 0.001, store_type: "단독매장", biz_type: "도넛/음식점업", area_pyeong: 0 },
  { store_id: "POC_026", store_name: "남구01", region: "부산광역시", city: "남구", center: "김해센터", annual_sales: 427632000, campaign_share: 0.054, store_type: "단독매장", biz_type: "제과,커피/음식점업", area_pyeong: 0 },
  { store_id: "POC_027", store_name: "정읍시01", region: "전라북도", city: "정읍시", center: "광주센터", annual_sales: 590690000, campaign_share: 0.000, store_type: "단독매장", biz_type: "상품대리/도매 및 소매업", area_pyeong: 0 },
  { store_id: "POC_028", store_name: "광명시01", region: "경기도", city: "광명시", center: "안양", annual_sales: 698812000, campaign_share: 0.001, store_type: "단독매장", biz_type: "도넛,커피/음식점업", area_pyeong: 0 },
  { store_id: "POC_029", store_name: "청주시01", region: "충청북도", city: "청주시", center: "신탄진", annual_sales: 1160696000, campaign_share: 0.000, store_type: "단독매장", biz_type: "빵류,과자류 및 당류 소매업/도매 및 소매업", area_pyeong: 0 },
  { store_id: "POC_030", store_name: "성남시01", region: "경기도", city: "성남시", center: "안양", annual_sales: 217296000, campaign_share: 0.080, store_type: "단독매장", biz_type: "판매대행(휴게음식점)/도매 및 소매업", area_pyeong: 0 },
  { store_id: "POC_031", store_name: "수원시01", region: "경기도", city: "수원시", center: "안양", annual_sales: 237225000, campaign_share: 0.000, store_type: "단독매장", biz_type: "상품대리/소매업", area_pyeong: 0 },
  { store_id: "POC_032", store_name: "여수시01", region: "전라남도", city: "여수시", center: "광주센터", annual_sales: null, campaign_share: 0.000, store_type: "단독매장", biz_type: "빵류,과자류,당류,초콜릿 도매업/도매 및 소매업", area_pyeong: 0 },
  { store_id: "POC_033", store_name: "고양시01", region: "경기도", city: "고양시", center: "안양", annual_sales: null, campaign_share: 0.000, store_type: "단독매장", biz_type: "커피,도넛/음식점", area_pyeong: 0 },
];

export const QUICK_FILTER_STORES = [
  "고양시02", "안양시01", "성남시01", "수원시01", "강서구01", "마포구01",
];

export const REGION_MAP: Record<string, string> = {};
for (const s of STORE_LIST) {
  if (s.region) REGION_MAP[s.region] = s.region;
}
export const REGIONS = [...new Set(STORE_LIST.map((s) => s.region))].filter(Boolean).sort();

export function getStoreById(id: string): StoreMaster | undefined {
  return STORE_LIST.find((s) => s.store_id === id);
}

export function getStoreByName(name: string): StoreMaster | undefined {
  return STORE_LIST.find((s) => s.store_name === name);
}

export function getStoresByRegion(region: string): StoreMaster[] {
  return STORE_LIST.filter((s) => s.region === region);
}

export function getStoresByFilter(filter: "all" | { region: string } | { storeId: string }): StoreMaster[] {
  if (filter === "all") return STORE_LIST;
  if ("region" in filter) return getStoresByRegion(filter.region);
  if ("storeId" in filter) {
    const s = getStoreById(filter.storeId);
    return s ? [s] : [];
  }
  return STORE_LIST;
}

export const TOTAL_STORES = STORE_LIST.length;

export function formatKRW(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return `${Math.round(n).toLocaleString()}원`;
}

export function formatKRWShort(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return `${Math.round(n).toLocaleString()}`;
}

export type StoreFilter = "all" | { region: string } | { storeId: string };

export function getFilterLabel(filter: StoreFilter): string {
  if (filter === "all") return "전체 점포";
  if ("region" in filter) return `${filter.region}`;
  if ("storeId" in filter) {
    const s = getStoreById(filter.storeId);
    return s ? s.store_name : filter.storeId;
  }
  return "전체 점포";
}