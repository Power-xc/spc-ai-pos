/**
 * 제품 이미지 경로 레지스트리
 * 모든 이미지는 /public/images/products/ 하위에 위치합니다.
 * POS(desktop)와 모바일 양쪽에서 공통으로 사용합니다.
 */

const BASE = "/images/products";

export const PRODUCT_IMAGES = {
  // ── 도넛류 ──────────────────────────────────────────────────
  donuts: {
    gwanjalliSaltMilkCream:       `${BASE}/donuts/gwangalli-salt-milk-cream.png`,
    nampoSesameHotteokTwist:      `${BASE}/donuts/nampo-sesame-hotteok-twist.png`,
    chocoMuffin:                  `${BASE}/donuts/choco-muffin.png`,
    cafeMochaRoll:                `${BASE}/donuts/cafe-mocha-roll.png`,
    lotusBiscoff:                 `${BASE}/donuts/lotus-biscoff.png`,
    strawberryCreamSmile:         `${BASE}/donuts/strawberry-cream-smile.png`,
    strawberryChocoFresh:         `${BASE}/donuts/strawberry-choco-fresh.png`,
    raspberryCreamCheese:         `${BASE}/donuts/raspberry-cream-cheese.png`,
    cloudCream:                   `${BASE}/donuts/cloud-cream.png`,
    bavarianField:                `${BASE}/donuts/bavarian-field.png`,
    butterGlazed:                 `${BASE}/donuts/butter-glazed.png`,
    blueberryCheesecakeYogurt:    `${BASE}/donuts/blueberry-cheesecake-yogurt.png`,
    bigSausageRoll:               `${BASE}/donuts/big-sausage-roll.png`,
    freshCreamCastella:           `${BASE}/donuts/fresh-cream-castella.png`,
    saltMilkCookiePuff:           `${BASE}/donuts/salt-milk-cookie-puff.png`,
    eggTart:                      `${BASE}/donuts/egg-tart.png`,
    espressoCookiePuff:           `${BASE}/donuts/espresso-cookie-puff.png`,
    chocoCrush:                   `${BASE}/donuts/choco-crush.png`,
    caramelCookieTwist:           `${BASE}/donuts/caramel-cookie-twist.png`,
    castellaDonut:                `${BASE}/donuts/castella-donut.png`,
    cacaoPoundCake:               `${BASE}/donuts/cacao-pound-cake.png`,
    cacaoHoneyDip:                `${BASE}/donuts/cacao-honey-dip.png`,
    cappuccinoTwist:              `${BASE}/donuts/cappuccino-twist.png`,
    cremeBrulee:                  `${BASE}/donuts/creme-brulee.png`,
    pochaccoMilkCreamTart:        `${BASE}/donuts/pochacco-milk-cream-tart.png`,
    pompompurinCaramelField:      `${BASE}/donuts/pompompurin-caramel-field.png`,
    pompompurinHappyRing:         `${BASE}/donuts/pompompurin-happy-ring.png`,
    peanutCastella:               `${BASE}/donuts/peanut-castella.png`,
    honeyOldFashioned:            `${BASE}/donuts/honey-old-fashioned.png`,
    honeyFritter:                 `${BASE}/donuts/honey-fritter.png`,
  },

  // ── 음료류 ──────────────────────────────────────────────────
  beverages: {
    vanillaLatte:                 `${BASE}/beverages/vanilla-latte.png`,
    icedVanillaLatte:             `${BASE}/beverages/iced-vanilla-latte.png`,
    icedCafeMocha:                `${BASE}/beverages/iced-cafe-mocha.png`,
    caramelMacchiato:             `${BASE}/beverages/caramel-macchiato.png`,
    cafeMocha:                    `${BASE}/beverages/cafe-mocha.png`,
    cappuccino:                   `${BASE}/beverages/cappuccino.png`,
    coldBrewLatte:                `${BASE}/beverages/cold-brew-latte.png`,
    coldBrewAmericano:            `${BASE}/beverages/cold-brew-americano.png`,
    honeyStrawberryLatte:         `${BASE}/beverages/honey-strawberry-latte.png`,
  },

  // ── 패키지/세트류 ────────────────────────────────────────────
  packages: {
    dunkinCombo:                  `${BASE}/packages/dunkin-combo.png`,
    munchkin10Pack3ea:            `${BASE}/packages/munchkin-10pack-3ea.png`,
    miniDonutSet1:                `${BASE}/packages/mini-donut-set-1.png`,
    miniDonutSet:                 `${BASE}/packages/mini-donut-set.png`,
    halfHalfPack1:                `${BASE}/packages/half-half-pack-1.png`,
    halfHalfPack:                 `${BASE}/packages/half-half-pack.png`,
    americanoDonut10:             `${BASE}/packages/americano-donut-10.png`,
    americanoMunchkin10:          `${BASE}/packages/americano-munchkin-10.png`,
    luckyMunchkin7set:            `${BASE}/packages/lucky-munchkin-7set.png`,
  },
} as const;

/** 이미지가 없는 제품에 사용하는 플레이스홀더 */
export const PLACEHOLDER_IMAGE = `${BASE}/coming-soon.png`;

/**
 * 제품 키로 이미지 경로를 조회합니다.
 * 매칭되는 이미지가 없으면 PLACEHOLDER_IMAGE를 반환합니다.
 */
export function getProductImage(key: string): string {
  const all = {
    ...PRODUCT_IMAGES.donuts,
    ...PRODUCT_IMAGES.beverages,
    ...PRODUCT_IMAGES.packages,
  } as Record<string, string>;
  return all[key] ?? PLACEHOLDER_IMAGE;
}

const KO_NAME_MAP: Record<string, string> = {
  "페이머스글레이즈드": "honeyOldFashioned",
  "글레이즈드 도넛":    "honeyOldFashioned",
  "글레이즈드":        "honeyOldFashioned",
  "허니 올드훼션드":   "honeyOldFashioned",
  "올드패션":          "honeyOldFashioned",
  "올드패션드":        "honeyOldFashioned",
  "소금우유도넛":      "gwanjalliSaltMilkCream",
  "광안리소금우유":     "gwanjalliSaltMilkCream",
  "스트로베리필드":    "strawberryCreamSmile",
  "딸기도넛":          "strawberryCreamSmile",
  "스트로베리 크림 스마일": "strawberryCreamSmile",
  "카카오하니딥":      "cacaoHoneyDip",
  "카카오후로스티드":  "cacaoPoundCake",
  "카카오 프라프치노":  "cappuccinoTwist",
  "허니후리터":        "honeyFritter",
  "허니 프리터":       "honeyFritter",
  "보스턴크림":        "bavarianField",
  "바바리안필드":      "bavarianField",
  "초코링":            "chocoCrush",
  "초코 크러쉬":       "chocoCrush",
  "두바이 도넛":       "lotusBiscoff",
  "두바이떠먹케":      "lotusBiscoff",
  "로투스 비스코프":   "lotusBiscoff",
  "블루베리 도넛":     "blueberryCheesecakeYogurt",
  "블루베리도넛":      "blueberryCheesecakeYogurt",
  "먼치킨":            "pompompurinHappyRing",
  "초코 먼치킨":       "chocoCrush",
  "시나몬 먼치킨":     "caramelCookieTwist",
  "카라멜 쿠키 츄이스티": "caramelCookieTwist",
  "캐스터라도넛":      "castellaDonut",
  "캐스터라":          "castellaDonut",
  "카라멜쿠키프레즐":   "caramelCookieTwist",
  "에그타르트":        "eggTart",
  "크림브륄레":        "cremeBrulee",
  "클라우드크림":      "cloudCream",
  "땅콩카스텔라":      "peanutCastella",
  "포차코밀크크림타르트": "pochaccoMilkCreamTart",
  "포순포순푸딩캐러멜필드": "pompompurinCaramelField",
  "포순포순포도핑링":   "pompompurinHappyRing",
  "아메리카노 원두":   "coldBrewAmericano",
  "아메리카노":        "coldBrewAmericano",
  "카페모카":          "cafeMocha",
  "카푸치노":          "cappuccino",
  "바닐라라떼":        "vanillaLatte",
  "아이스 바닐라 라떼": "icedVanillaLatte",
  "콜드브루라떼":      "coldBrewLatte",
  "콜드브루 아메리카노": "coldBrewAmericano",
  "허니딸기라떼":      "honeyStrawberryLatte",
  "카라멜마키아토":     "caramelMacchiato",
  "아이스 카페모카":    "icedCafeMocha",
  "빅소시지롤":        "bigSausageRoll",
  "남포김떡꼬치":      "nampoSesameHotteokTwist",
  "초코머핀":          "chocoMuffin",
  "카페모카롤":        "cafeMochaRoll",
  "라즈베리크림치즈":   "raspberryCreamCheese",
  "딸기초코프레쉬":    "strawberryChocoFresh",
  "에스프레소쿠키프레첼": "espressoCookiePuff",
  "버터글레이즈드":     "butterGlazed",
  "프레시크림카스텔라":  "freshCreamCastella",
  "소금우유쿠키프레첼":  "saltMilkCookiePuff",
};

/** 한국어 상품명으로 이미지 경로를 조회합니다. */
export function getProductImageByName(name: string): string {
  const key = KO_NAME_MAP[name];
  if (key) return getProductImage(key);
  // 부분 매칭 시도
  const partialKey = Object.keys(KO_NAME_MAP).find((k) => name.includes(k) || k.includes(name));
  if (partialKey) return getProductImage(KO_NAME_MAP[partialKey]);
  return PLACEHOLDER_IMAGE;
}
