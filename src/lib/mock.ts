// Chế độ demo: sinh storyboard Giáng sinh mẫu từ thư viện bằng template (không gọi API).
// Dùng khi chưa có ANTHROPIC_API_KEY hoặc bật "Chế độ demo" trong Cài đặt.

import { placeholdersIn } from "./assemble";
import type { RawGeneration, RawIdeaBatch, RawLocation, RawShot } from "./llmSchemas";
import { videoLengthLabel, type GenContext } from "./prompts";
import type { Character, EraYear, PlannedShot, ShotClass, StructurePlan, Tone } from "./types";

// ---------- RNG có seed (kết quả lặp lại được) ----------

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Nhân vật mẫu ----------

const COUPLES: Character[][] = [
  [
    { id: "HE", role: "male lead", description: "an early-20s man with a glossy black pompadour, warm brown eyes and a strong jaw, wearing a charcoal wool overcoat over a red cable-knit sweater, grey slacks and black galoshes, a red plaid scarf" },
    { id: "SHE", role: "female lead", description: "an early-20s woman with platinum-blonde victory-roll curls and red lipstick, wearing a cherry-red wool swing coat with a white fur collar, white mittens and a white knit beret" },
  ],
  [
    { id: "HE", role: "male lead", description: "a 22-year-old man with a sandy-brown ducktail haircut, freckles and an easy grin, wearing a navy pea coat over a cream turtleneck, dark trousers and lace-up boots, a green knit scarf" },
    { id: "SHE", role: "female lead", description: "a 20-year-old woman with a glossy auburn ponytail tied with a green velvet ribbon, bright green eyes, wearing a camel wool coat over a red tartan skirt, a sprig of holly pinned to her collar" },
  ],
  [
    { id: "HE", role: "male lead", description: "a mid-20s man with slicked-back dark hair, a thin mustache and kind hazel eyes, wearing a camel overcoat, a grey fedora and brown leather gloves, a silver wristwatch" },
    { id: "SHE", role: "female lead", description: "a 21-year-old woman with short raven-black curls, rosy cheeks and a beauty mark, wearing an emerald-green velvet dress under a white wool coat, pearl earrings and a fur muff" },
  ],
];

const FAMILY: Character[] = [
  { id: "MOTHER", role: "mother", description: "an early-30s woman with a short curled auburn bob and red lipstick, wearing a green shirtwaist dress with a white apron and a string of pearls" },
  { id: "GIRL", role: "daughter", description: "a 7-year-old girl with blonde pigtails tied with red ribbons and freckles, wearing a red velvet dress with a white lace collar and white knee socks" },
  { id: "FATHER", role: "father", description: "a mid-30s man with neatly parted brown hair and horn-rimmed glasses, wearing a brown cardigan over a white shirt and knit tie, grey slacks" },
  { id: "BOY", role: "son", description: "a 9-year-old boy with a short brown crew cut and a gap-toothed grin, wearing a blue-and-white Nordic sweater, corduroy trousers and a red knit cap" },
];

const KIDS: Character[] = [
  { id: "GIRL", role: "little sister", description: "a 7-year-old girl with blonde pigtails tied with red ribbons and freckles, wearing a white knit hat, a red wool coat and white mittens on a string" },
  { id: "BOY", role: "big brother", description: "a 10-year-old boy with a short brown crew cut and a gap-toothed grin, wearing a blue-and-white Nordic sweater, a green knit cap and rubber snow boots" },
];

const GRANDPARENTS: Character[] = [
  { id: "GRANDMA", role: "grandmother", description: "a 68-year-old woman with silver hair in a neat bun and kind blue eyes, wearing a lavender knit shawl over a floral dress and a cameo brooch" },
  { id: "GRANDPA", role: "grandfather", description: "a 70-year-old man with a white mustache, rosy cheeks and round spectacles, wearing a grey wool vest over a flannel shirt with suspenders and a gold watch chain" },
];

export function mockCouple(seedText: string): Character[] {
  const pick = COUPLES[hashSeed(seedText) % COUPLES.length];
  return pick.map((c) => ({ ...c }));
}

export type CastKind = "couple" | "family" | "kids" | "grandparents" | "none";

/** Video theo ai, đoán từ dàn ý tiếng Việt: "chỉ cảnh" → không nhân vật; gia đình; ông bà; trẻ em; còn lại là cặp đôi. */
export function castKind(outline: string): CastKind {
  const s = outline.toLowerCase();
  if (/chỉ cảnh|không (có )?nhân vật|không có người|phong cảnh/.test(s)) return "none";
  if (/gia đình|cả nhà|bố mẹ|cha mẹ|ba mẹ/.test(s)) return "family";
  if (/ông bà|ông cụ|bà cụ|vợ chồng già|ông lão|bà lão/.test(s)) return "grandparents";
  if (/trẻ em|trẻ con|bọn trẻ|lũ trẻ|đứa trẻ|cậu bé|cô bé|hai anh em|chị em/.test(s)) return "kids";
  return "couple";
}

/** Nhân vật mẫu cho một ý tưởng (theo dàn ý); [] = video chỉ có cảnh. */
export function mockCast(seedText: string, outline: string): Character[] {
  const kind = castKind(outline);
  if (kind === "none") return [];
  if (kind === "family") return FAMILY.map((c) => ({ ...c }));
  if (kind === "kids") return KIDS.map((c) => ({ ...c }));
  if (kind === "grandparents") return GRANDPARENTS.map((c) => ({ ...c }));
  return mockCouple(seedText);
}

/** Nhân vật của MV đang sinh: cố định (series / MV có sẵn) hoặc nhân vật mẫu theo dàn ý. */
function castOf(ctx: GenContext): Character[] {
  return ctx.fixedBible?.characters ?? mockCast(`${ctx.idea.series ?? ""}|${ctx.idea.id}|${ctx.idea.world_location}`, ctx.idea.outline);
}

// ---------- Template cảnh ----------

interface Pools {
  landmark: (i: number) => string;
  vehicle: (i: number) => string;
  prop: (i: number) => string;
  light: string;
  dance: string;
  year: number;
  place: string;
  /** Placeholder của nhân vật chính và nhân vật thứ hai (vd. "{{HE}}", "{{SHE}}"). */
  a: string;
  b: string;
}

interface Template {
  core: (p: Pools) => string;
  vi: string;
  camera: string;
  motion?: boolean;
  sizes?: ShotClass[];
}

const T: Record<string, Template[]> = {
  intro: [
    { core: (p) => `of ${p.landmark(0)} at Christmastime in ${p.year}, snow drifting down past garlands of colored bulbs, a ${p.vehicle(0)} gliding by, ${p.light}, slow crane shot descending to street level, nostalgic anticipation`, vi: "Toàn cảnh bối cảnh mùa Giáng sinh đúng năm, tuyết rơi, đèn màu và xe cổ.", camera: "slow crane down", sizes: ["wide"] },
    { core: (p) => `of ${p.landmark(1)} dressed for the holidays, wreaths on every door, a ${p.vehicle(1)} parked at the snowy curb, ${p.prop(0)} in the foreground, ${p.light}, gentle push-in, warm and inviting`, vi: "Landmark trang trí Giáng sinh, vòng hoa trên cửa, xe cổ đỗ bên lề tuyết.", camera: "slow push-in", sizes: ["medium", "close"] },
    { core: (p) => `of ${p.landmark(2)} seen through falling snowflakes, shoppers in wool coats crossing the street, ${p.light}, smooth lateral dolly, festive promise`, vi: "Bối cảnh nhìn qua làn tuyết rơi, người mua sắm mặc áo len dạ băng qua đường.", camera: "lateral dolly", sizes: ["wide", "medium"] },
    { core: (p) => `of a glass ornament hanging on a fir branch in sharp focus with ${p.landmark(0)} glowing softly behind, ${p.light}, slow rack focus to the street, quiet expectation`, vi: "Cận cảnh quả châu trên cành thông, hậu cảnh là con phố lung linh.", camera: "rack focus", sizes: ["close"] },
  ],
  verse1: [
    { core: (p) => `${p.a} carries a fresh fir tree along ${p.landmark(0)}, breath steaming in the cold, ${p.light}, steady tracking shot alongside, cheerful`, vi: "Nhân vật vác cây thông mới chặt đi dọc phố, hơi thở bốc khói.", camera: "tracking shot", sizes: ["wide", "medium"] },
    { core: (p) => `${p.a} presses close to a toy-shop window full of ${p.prop(1)} and a circling electric train, eyes shining, slow dolly in, wide-eyed wonder`, vi: "Nhân vật áp sát tủ kính cửa hàng đồ chơi, mắt sáng lên.", camera: "slow dolly in", sizes: ["medium", "close"] },
    { core: (p) => `${p.a} and ${p.b} hang glass ornaments and silver tinsel on a tall fir tree by a frosted window, ${p.light}, slow pan, happy anticipation`, vi: "Hai người treo quả châu và kim tuyến lên cây thông bên ô cửa đóng băng.", camera: "slow pan", sizes: ["medium", "wide"] },
    { core: (p) => `${p.a} and ${p.b} walk past ${p.landmark(1)} with arms full of wrapped presents, laughing as a box slips, handheld follow, light-hearted`, vi: "Hai người ôm đầy quà đi qua phố, bật cười khi một hộp quà tuột tay.", camera: "handheld follow", sizes: ["medium", "wide"] },
    { core: (p) => `${p.a} writes a letter by lamplight at a kitchen table, a candle and a plate of cookies nearby, ${p.light}, slow push-in, tender hope`, vi: "Nhân vật viết thư dưới ánh đèn bàn, bên cạnh nến và đĩa bánh quy.", camera: "slow push-in", sizes: ["close"] },
    { core: (p) => `${p.a} ties a red ribbon on a wreath at the front door as snow settles on the porch, ${p.light}, gentle drift, homey warmth`, vi: "Nhân vật buộc nơ đỏ lên vòng hoa ở cửa nhà, tuyết đọng trên hiên.", camera: "gentle drift", sizes: ["close", "medium"] },
  ],
  pre: [
    { core: () => `{{A}} looks up as the first snowflakes fall, holding out an open palm to catch one, slow motion, soft bokeh of colored lights behind, slow push-in, quiet wonder`, vi: "Nhân vật ngước nhìn bông tuyết đầu mùa, xoè tay hứng.", camera: "slow push-in", sizes: ["close"] },
    { core: (p) => `${p.a} and ${p.b} watch as the colored bulbs of the tree switch on all at once, faces lit in red and green, slow motion, rack focus, breathless magic`, vi: "Hai người nhìn đèn cây thông bật sáng cùng lúc, gương mặt ửng đỏ xanh.", camera: "rack focus", sizes: ["close", "medium"] },
    { core: (p) => `${p.a} breathes on a frosted window and draws a small heart, ${p.landmark(0)} twinkling outside, slow push-in, tender spark`, vi: "Nhân vật hà hơi lên ô kính đóng băng và vẽ một trái tim nhỏ.", camera: "slow push-in", sizes: ["close", "medium"] },
    { core: (p) => `${p.a} and ${p.b} on opposite sides of a snowy street, a ${p.vehicle(0)} passing between them, both turning at the same moment and smiling, whip pan between their faces, sudden warmth`, vi: "Hai người ở hai bên phố tuyết, cùng quay lại mỉm cười khi xe chạy qua.", camera: "whip pan", sizes: ["wide", "medium"] },
  ],
  chorusMotion: [
    { core: (p) => `${p.a} and ${p.b} skate hand in hand across a frozen pond near ${p.landmark(0)}, scarves flying, strings of bulbs overhead, low tracking shot along the ice, joyful`, vi: "Hai người nắm tay trượt băng trên hồ đóng băng, khăn bay theo gió.", camera: "low tracking shot", motion: true, sizes: ["wide", "medium"] },
    { core: (p) => `${p.a} and ${p.b} race down a snowy hill on a wooden sled, snow spraying, laughing, low camera as they rush past, exhilarated`, vi: "Hai người lao xuống đồi tuyết trên xe trượt gỗ, tuyết tung toé.", camera: "low pass-by", motion: true, sizes: ["wide", "medium"] },
    { core: (p) => `${p.a} and ${p.b} throw snowballs at each other in a snowy yard, ducking behind a snowman, slow motion bursts of powder, handheld follow, playful mischief`, vi: "Hai người ném tuyết vào nhau, nấp sau người tuyết.", camera: "handheld follow", motion: true, sizes: ["medium", "wide"] },
    { core: (p) => `${p.a} and ${p.b} swing dance at a holiday party under paper chains and garlands, spinning and laughing, ${p.light}, slow 360-degree orbit, festive energy`, vi: "Hai người nhảy swing trong tiệc Giáng sinh dưới dây giấy trang trí.", camera: "slow 360° orbit", motion: true, sizes: ["medium", "wide"] },
    { core: (p) => `${p.a} spins in place in the falling snow, arms wide, ${p.landmark(1)} glowing behind, overhead camera turning, pure delight`, vi: "Nhân vật xoay tròn giữa trời tuyết, dang rộng hai tay.", camera: "overhead spin", motion: true, sizes: ["medium", "wide"] },
    { core: (p) => `${p.a} and ${p.b} run through fresh snow toward a glowing house, kicking up powder, ${p.light}, steadicam follow, carefree joy`, vi: "Hai người chạy qua lớp tuyết mới về phía ngôi nhà sáng đèn.", camera: "steadicam follow", motion: true, sizes: ["wide"] },
  ],
  chorus: [
    { core: (p) => `${p.a} and ${p.b} clink mugs of steaming cocoa by a crackling fireplace, stockings hanging above, warm firelight, slow orbit, cozy happiness`, vi: "Hai người cụng ly ca cao nóng bên lò sưởi, tất treo phía trên.", camera: "slow orbit", sizes: ["medium", "close"] },
    { core: (p) => `${p.a} laughs with snowflakes catching in the hair, ${p.light} glowing behind, slow motion, gentle drift, pure happiness`, vi: "Nhân vật bật cười, bông tuyết vương trên tóc.", camera: "gentle drift", sizes: ["close"] },
    { core: (p) => `${p.a} and ${p.b} share a warm hug in the falling snow under a lamppost wrapped in garland, slow push-in, overwhelming tenderness`, vi: "Hai người ôm nhau giữa tuyết rơi dưới cột đèn quấn vòng hoa.", camera: "slow push-in", sizes: ["close", "medium"] },
    { core: (p) => `${p.a} unwraps a small present and gasps with delight while ${p.b} watches smiling, colored tree lights twinkling, handheld close, sweet surprise`, vi: "Nhân vật mở món quà nhỏ và reo lên, người kia mỉm cười nhìn.", camera: "handheld close", sizes: ["close", "medium"] },
    { core: (p) => `${p.a} and ${p.b} stand before a glowing department-store window with animated toys, reflections dancing on the glass, slow lateral dolly, festive wonder`, vi: "Hai người đứng trước tủ kính cửa hàng có đồ chơi chuyển động.", camera: "slow lateral dolly", sizes: ["medium", "wide"] },
  ],
  verse2: [
    { core: (p) => `${p.a} and ${p.b} roll out gingerbread cookies in a warm kitchen, flour dusting the air, ${p.light}, slow dolly in, homey joy`, vi: "Hai người cán bột làm bánh gừng trong căn bếp ấm, bột bay lả tả.", camera: "slow dolly in", sizes: ["medium", "close"] },
    { core: (p) => `${p.a} opens the front door to carolers with lanterns, snow falling behind them, ${p.light}, tracking shot, heartwarming welcome`, vi: "Nhân vật mở cửa đón nhóm hát mừng cầm đèn lồng.", camera: "tracking shot", sizes: ["medium", "wide"] },
    { core: (p) => `${p.a} and ${p.b} ride in a horse-drawn sleigh past ${p.landmark(2)}, bells jingling, a plaid blanket over their knees, parallel tracking shot, nostalgic delight`, vi: "Hai người ngồi xe trượt ngựa kéo đi qua phố, chuông leng keng.", camera: "parallel tracking shot", sizes: ["wide", "medium"] },
    { core: (p) => `${p.a} wraps a scarf around ${p.b} on a snowy porch, both smiling, ${p.light}, slow rack focus, playful tenderness`, vi: "Nhân vật quàng khăn cho người kia trên hiên nhà phủ tuyết.", camera: "rack focus", sizes: ["close", "medium"] },
    { core: (p) => `${p.a} and ${p.b} gaze out of a frosted train window at a snowy valley rolling by, ${p.light}, slow push-in, wistful anticipation`, vi: "Hai người nhìn ra cửa sổ tàu đóng băng, thung lũng tuyết trôi qua.", camera: "slow push-in", sizes: ["medium", "close"] },
    { core: () => `{{A}} whispers a secret wish and {{B}} bursts out laughing, candlelight flickering, slow motion, shallow focus, easy intimacy`, vi: "Một người thì thầm điều ước, người kia bật cười dưới ánh nến.", camera: "static close", sizes: ["close"] },
  ],
  bridge: [
    { core: (p) => `${p.a} and ${p.b} sit side by side by a window at dusk, a single candle glowing on the sill, ${p.landmark(0)} lighting up outside, slow push-in, quiet intimacy`, vi: "Hai người ngồi cạnh cửa sổ lúc chạng vạng, một ngọn nến trên bậu cửa.", camera: "slow push-in", sizes: ["wide", "medium"] },
    { core: () => `{{A}} reads a letter from home beside a tiny decorated tree, soft lamplight, slow dolly back, wistful pause`, vi: "Nhân vật đọc lá thư từ quê nhà bên cây thông nhỏ.", camera: "slow dolly back", sizes: ["medium", "close"] },
    { core: () => `{{A}} closes both eyes and makes a wish at a frosted window as snow falls outside, gentle handheld, a moment of hope`, vi: "Nhân vật nhắm mắt ước nguyện bên ô cửa đóng băng.", camera: "gentle handheld", sizes: ["medium", "close", "wide"] },
  ],
  finalMotion: [
    { core: (p) => `${p.a} and ${p.b} lead a crowd of dancers in a joyful swing routine at a Christmas party in ${p.place}, everyone spinning in sync under garlands, sweeping crane up, euphoric climax`, vi: "Hai người dẫn cả đám đông nhảy swing trong tiệc Giáng sinh.", camera: "sweeping crane up", motion: true, sizes: ["wide"] },
    { core: (p) => `${p.a} lifts ${p.b} and swings around in a full circle in the falling snow, ${p.landmark(1)} glowing behind, fast orbit, triumphant joy`, vi: "Một người bế người kia xoay một vòng giữa trời tuyết.", camera: "fast orbit", motion: true, sizes: ["medium", "wide"] },
    { core: (p) => `${p.a} and ${p.b} skate in fast circles on a lantern-lit rink as other skaters cheer near ${p.landmark(2)}, whip pan into slow motion, show-stopping finale`, vi: "Hai người trượt băng thành vòng nhanh, mọi người reo hò.", camera: "whip pan into slow motion", motion: true, sizes: ["medium", "wide"] },
  ],
  final: [
    { core: (p) => `${p.a} and ${p.b} open presents beneath a glowing tree, wrapping paper everywhere, warm firelight, slow push-in, magical`, vi: "Mọi người mở quà dưới cây thông lung linh, giấy gói khắp nơi.", camera: "slow push-in", sizes: ["close", "medium"] },
    { core: (p) => `${p.a} rests against ${p.b} by the fire as snow drifts past the window, slow motion, blissful`, vi: "Hai người tựa vào nhau bên lò sưởi, tuyết bay ngoài cửa sổ.", camera: "slow motion drift", sizes: ["close", "medium"] },
  ],
  outro: [
    { core: (p) => `seen from behind, ${p.a} and ${p.b} walk side by side down a snowy lane toward ${p.landmark(0)}, windows glowing one by one, camera slowly rising, peaceful happy ending`, vi: "Hai người sánh bước trên con đường tuyết, cửa sổ lần lượt sáng đèn.", camera: "slow crane up", sizes: ["wide"] },
    { core: (p) => `of ${p.landmark(1)} late on Christmas night, quiet and glowing under falling snow, a ${p.vehicle(0)} driving off into the distance, slow pull-back, silent night`, vi: "Bối cảnh đêm Giáng sinh yên tĩnh dưới tuyết, chiếc xe cổ chạy xa dần.", camera: "slow pull-back", sizes: ["wide"] },
  ],
  // Cảnh đời sống Giáng sinh thập niên 50 (không có nhân vật chính).
  era: [
    { core: (p) => `of carolers in long wool coats holding candle lanterns at a snowy doorstep near ${p.landmark(0)} in ${p.year}, neighbors leaning out of glowing windows, ${p.light}, slow crane down, golden-age warmth`, vi: "Giáng sinh 50s: nhóm hát mừng cầm đèn lồng trước cửa nhà phủ tuyết.", camera: "slow crane down", sizes: ["wide", "medium"] },
    { core: (p) => `of a lantern-lit Christmas tree lot, a man in a plaid cap tying a fir tree onto the roof of a ${p.vehicle(1)} as families pick their trees, slow dolly along the rows, cheerful tradition`, vi: "Giáng sinh 50s: chợ cây thông sáng đèn lồng, người buộc cây lên nóc xe.", camera: "slow dolly", sizes: ["wide", "medium"] },
    { core: (p) => `of a department-store Santa in a red suit greeting a line of excited children in snowsuits, ${p.prop(0)} all around, ${p.light}, gentle push-in, wide-eyed wonder`, vi: "Giáng sinh 50s: ông già Noel ở cửa hàng đón hàng dài trẻ con.", camera: "slow push-in", sizes: ["medium", "wide"] },
    { core: () => `of children sledding down a snowy hill on wooden sleds, scarves streaming, a church steeple in the distance, low tracking shot, innocent winter joy`, vi: "Giáng sinh 50s: trẻ con trượt xe trượt gỗ xuống đồi tuyết.", camera: "low tracking shot", sizes: ["wide", "medium"] },
    { core: (p) => `of skaters in long scarves circling a frozen pond under strings of colored bulbs near ${p.landmark(2)}, breath steaming, slow lateral dolly, nostalgic delight`, vi: "Giáng sinh 50s: người trượt băng vòng quanh hồ dưới dây đèn màu.", camera: "lateral dolly", sizes: ["wide"] },
    { core: (p) => `of a mailman in a navy cap carrying a sack of parcels through the snow to a porch with a wreath, a ${p.vehicle(0)} parked nearby, ${p.light}, slow lateral dolly, friendly small-town Christmas`, vi: "Giáng sinh 50s: người đưa thư mang bao bưu phẩm qua tuyết đến hiên nhà.", camera: "lateral dolly", sizes: ["medium", "wide"] },
    { core: () => `of a family silhouetted in a big picture window, decorating a glowing tree with colored bulbs while snow falls on the lawn outside, slow push-in from the street, cozy suburban warmth`, vi: "Giáng sinh 50s: bóng một gia đình trang trí cây thông sau khung cửa kính lớn.", camera: "slow push-in", sizes: ["wide", "medium"] },
    { core: (p) => `of a toy-shop window with a model electric train circling a tiny snowy village, children's mittens pressed to the glass, ${p.light}, slow push-in, magical`, vi: "Giáng sinh 50s: tủ kính cửa hàng đồ chơi với đoàn tàu điện chạy quanh làng tuyết nhỏ.", camera: "slow push-in", sizes: ["close", "medium"] },
    { core: () => `of a children's choir in white robes singing by candlelight in a small wooden church, snow on the windows, slow crane down the aisle, reverent peace`, vi: "Giáng sinh 50s: dàn hợp xướng thiếu nhi hát dưới ánh nến trong nhà thờ nhỏ.", camera: "slow crane down", sizes: ["wide", "medium"] },
    { core: () => `of a steam locomotive puffing white clouds as it crosses a snowy valley at dusk, warm lights glowing in every passenger car, slow aerial-style tracking shot, nostalgic journey home`, vi: "Giáng sinh 50s: tàu hơi nước băng qua thung lũng tuyết lúc chạng vạng.", camera: "aerial-style tracking", sizes: ["wide"] },
  ],
  // Video chỉ có cảnh (không nhân vật chính): cảnh chuyển động và cảnh lắng của mùa lễ.
  sceneMotion: [
    { core: (p) => `of a horse-drawn sleigh full of laughing passengers gliding past ${p.landmark(0)}, bells jingling, snow spraying from the runners, parallel tracking shot, festive joy`, vi: "Xe trượt ngựa kéo chở đầy khách cười vang lướt qua phố.", camera: "parallel tracking shot", motion: true, sizes: ["wide", "medium"] },
    { core: (p) => `of couples swing dancing at a holiday party under paper chains in ${p.place}, skirts flaring and a big band playing, slow 360-degree orbit, festive energy`, vi: "Các cặp đôi nhảy swing trong tiệc Giáng sinh, ban nhạc lớn chơi.", camera: "slow 360° orbit", motion: true, sizes: ["wide", "medium"] },
    { core: () => `of a snowball fight between neighborhood kids in a snowy yard, powder bursting in slow motion around a snowman, handheld follow, playful mischief`, vi: "Bọn trẻ trong xóm ném tuyết vào nhau quanh người tuyết.", camera: "handheld follow", motion: true, sizes: ["medium", "wide"] },
  ],
  sceneCalm: [
    { core: (p) => `of stockings hanging over a crackling fireplace, a decorated tree glowing in the corner and a cat curled on the rug, ${p.light}, slow push-in, cozy stillness`, vi: "Tất treo trên lò sưởi tí tách, cây thông sáng đèn, con mèo cuộn tròn trên thảm.", camera: "slow push-in", sizes: ["medium", "close"] },
    { core: (p) => `of snow settling on the rooftops and chimneys of ${p.landmark(1)}, smoke curling into a starry sky, slow crane up, serene silent night`, vi: "Tuyết phủ mái nhà và ống khói, khói bay lên bầu trời đầy sao.", camera: "slow crane up", sizes: ["wide"] },
    { core: () => `of a single candle glowing in a frosted window with a wreath, snowflakes drifting past outside, slow rack focus, quiet hope`, vi: "Một ngọn nến sáng bên ô cửa đóng băng có vòng hoa, tuyết bay ngoài trời.", camera: "rack focus", sizes: ["close"] },
    { core: () => `of mugs of cocoa and a plate of gingerbread cookies beside a window, steam rising, snow falling outside, gentle drift, homey warmth`, vi: "Cốc ca cao và đĩa bánh gừng bên cửa sổ, hơi nóng bốc lên.", camera: "gentle drift", sizes: ["close", "medium"] },
  ],
};

function groupFor(section: string, motion: boolean): string[] {
  const s = section.toLowerCase();
  if (s.includes("intro")) return ["intro"];
  if (s.includes("pre")) return ["pre"];
  if (s.includes("final")) return motion ? ["finalMotion", "chorusMotion"] : ["final", "chorus"];
  if (s.includes("chorus")) return motion ? ["chorusMotion"] : ["chorus", "chorusMotion"];
  if (s.includes("bridge")) return ["bridge", "verse2"];
  if (s.includes("outro")) return ["outro"];
  if (/verse 2|verse2|\b2\b/.test(s)) return ["verse2"];
  return ["verse1"];
}

/** Nhóm mẫu cho video chỉ có cảnh: mở đầu / kết bằng cảnh rộng, chuyển động, còn lại xen cảnh đời sống và cảnh lắng. */
function sceneGroupFor(section: string, motion: boolean): string[] {
  const s = section.toLowerCase();
  if (s.includes("intro")) return ["intro"];
  if (s.includes("outro")) return ["sceneCalm"];
  return motion ? ["sceneMotion"] : ["era", "sceneCalm"];
}

const SIZE_LABEL: Record<ShotClass, string[]> = {
  wide: ["Wide shot", "Extreme wide shot", "Wide establishing shot"],
  medium: ["Medium shot", "Medium tracking shot", "Medium two-shot"],
  close: ["Close-up", "Extreme close-up", "Tight close-up"],
};
const SIZE_VALUE: Record<ShotClass, string> = { wide: "wide", medium: "medium", close: "close-up" };

const TRANSITIONS = ["match cut on the tree lights", "dissolve through falling snow", "cut on the sleigh-bell beat", "whip pan through snowflakes", "match cut on a glowing window", "soft cross-fade through candlelight"];

const TONE_MOOD: Record<Tone, string> = { default: "", playful: ", playful and merry", melancholy: ", bittersweet and wistful", cinematic: ", grand and cinematic" };

function audioFor(section: string): string {
  const s = section.toLowerCase();
  if (s.includes("intro")) return "soft sleigh bells and a gentle crooner Christmas melody fading in, distant church bells";
  if (s.includes("pre")) return "music softens to a twinkling celesta, the hush of falling snow";
  if (s.includes("chorus")) return "jolly big band Christmas swing with sleigh bells, happy chatter";
  if (s.includes("bridge")) return "a quiet piano carol, a crackling fireplace";
  if (s.includes("outro")) return "final chord with chimes, soft wind and falling snow ambience";
  return "warm Christmas jazz trio, footsteps crunching on snow";
}

/** Nơi không có tuyết (địa điểm cấm "snow", vd. Hollywood, Miami): mẫu cảnh đổi tuyết thành đèn, cát, hoa giấy. */
const warmPlace = (ctx: GenContext) => (ctx.location.forbidden ?? []).some((f) => f.term.toLowerCase() === "snow");
function warmify(text: string): string {
  return text
    .replace(/\bfalling snow\b/gi, "the warm evening air")
    .replace(/\bfresh snow\b/gi, "warm sand")
    .replace(/\bsnow(-covered|y)\b/gi, "palm-lined")
    .replace(/\bsnowflakes?\b/gi, "drifting confetti")
    .replace(/\bsnowballs?\b/gi, "water balloons")
    .replace(/\bsnowm[ae]n\b/gi, "sandcastle")
    .replace(/\bsnow\b/gi, "twinkling lights");
}

function withArticle(x: string): string {
  return /^(a|an|the)\s/i.test(x) ? x : `the ${x}`;
}

function pools(ctx: GenContext, cast: Character[]): Pools {
  const loc = ctx.location;
  const at = <V,>(arr: V[], fallback: V) => (i: number) => (arr.length ? arr[i % arr.length] : fallback);
  const vehicles = loc.vehicles.length ? loc.vehicles : ctx.eraYear.vehicles;
  return {
    landmark: (i) => withArticle(at(loc.landmarks, `${ctx.idea.world_location} street`)(i)),
    vehicle: at(vehicles.map((v) => v.replace(/\s*\(.*?\)\s*/g, " ").trim()), "vintage sedan"),
    prop: at(loc.props.length ? loc.props : ctx.eraYear.props, "wrapped presents"),
    light: loc.light.split(",")[0] || "soft winter light",
    dance: (ctx.eraYear.music_dance.find((d) => /jitterbug|bop|swing|lindy|rock/i.test(d)) ?? "swing").replace(/craze/i, "").trim(),
    year: ctx.year,
    place: ctx.locationKey ?? ctx.idea.world_location,
    a: cast[0] ? `{{${cast[0].id}}}` : "a passer-by",
    b: cast[1] ? `{{${cast[1].id}}}` : "a smiling neighbor",
  };
}

/** Sinh một cảnh mẫu cho một ô trong plan. `variant` khác nhau cho ra phiên bản khác. */
export function mockShot(ctx: GenContext, slot: PlannedShot, variant = 0, used?: Set<string>): RawShot {
  const r = rng(hashSeed(`${ctx.idea.id}|${ctx.idea.world_location}|${slot.shot_no}|${variant}|${ctx.tone}`));
  const cast = castOf(ctx);
  const p = pools(ctx, cast);
  const groups = slot.era_life ? ["era"] : cast.length ? groupFor(slot.section, slot.must_motion) : sceneGroupFor(slot.section, slot.must_motion);
  const candidates = groups.flatMap((g) => T[g].map((t, i) => ({ t, key: `${g}:${i}` })));
  const bySize = candidates.filter(({ t }) => !t.sizes || t.sizes.includes(slot.size_hint));
  const pool = (bySize.length ? bySize : candidates).filter(({ key }) => !used?.has(key));
  const list = pool.length ? pool : bySize.length ? bySize : candidates;
  // Cảnh đời sống Giáng sinh: lần lượt từng mẫu (theo thứ tự cảnh trong plan) để không lặp cùng một hoạt động.
  const eraIndex = slot.era_life ? ctx.plan.shots.filter((s) => s.era_life && s.shot_no < slot.shot_no).length : -1;
  const eraPick = eraIndex >= 0 ? candidates[(eraIndex + hashSeed(ctx.idea.world_location) + variant) % candidates.length] : null;
  const { t, key } = eraPick ?? list[Math.floor(r() * list.length)];
  used?.add(key);

  const offset = Math.floor(r() * 3);
  const shifted: Pools = {
    ...p,
    landmark: (i) => p.landmark(i + offset + variant),
    vehicle: (i) => p.vehicle(i + offset + variant),
    prop: (i) => p.prop(i + offset + variant),
  };
  const sizeLabel = SIZE_LABEL[slot.size_hint][Math.floor(r() * 3)];
  let body = t.core(shifted).replace(/\{\{A\}\}/g, p.a).replace(/\{\{B\}\}/g, p.b) + (TONE_MOOD[ctx.tone] ?? "");
  if (slot.signature_shot) body += `, ${slot.signature_shot}`;
  if (warmPlace(ctx)) body = warmify(body);
  const core = body.startsWith("of ") ? `${sizeLabel} ${body}` : `${sizeLabel}, ${body}`;
  const isLast = slot.shot_no === ctx.plan.shots.length;
  return {
    shot_no: slot.shot_no,
    shot_size: SIZE_VALUE[slot.size_hint],
    camera: t.camera,
    characters_in_shot: placeholdersIn(core),
    description_vi: t.vi,
    prompt_core: core,
    audio: ctx.profile.supports_audio ? audioFor(slot.section) : null,
    negative_extra: [],
    transition_to_next: isLast ? "fade out" : TRANSITIONS[Math.floor(r() * TRANSITIONS.length)],
    signature_shot: slot.signature_shot,
    is_motion: Boolean(t.motion) || slot.must_motion,
  };
}

/** Gợi ý lặp cảnh khi video dùng một bộ cảnh cố định rồi lặp lại cho hết danh sách nhạc. */
export function loopNote(plan: StructurePlan): { section: string; note_vi: string } {
  const list = (pred: (name: string) => boolean) =>
    plan.shots
      .filter((s) => pred(s.section.toLowerCase()))
      .map((s) => `#${s.shot_no}`)
      .join(", ");
  const chorus = list((n) => n.includes("chorus") && !n.includes("pre"));
  const verse = list((n) => n.includes("verse") || n.includes("pre"));
  const calm = list((n) => n.includes("intro") || n.includes("bridge") || n.includes("outro"));
  return {
    section: "Lặp cảnh",
    note_vi: `Video dùng ${plan.shots.length} cảnh rồi lặp lại (xáo thứ tự mỗi vòng) cho hết danh sách nhạc. Mở video bằng cảnh rộng #1; cảnh vui (${chorus}) xen với cảnh kể chuyện (${verse}) và cảnh lắng (${calm}). Tránh để cùng một cảnh lặp liền nhau; cảnh lắng hợp để chuyển giữa hai bài.`,
  };
}

export function mockEditingNotes(plan: StructurePlan, loop = false): { section: string; note_vi: string }[] {
  const notes = plan.sections.map((s) => {
    const n = s.name.toLowerCase();
    let note = "Giữ nguyên clip, chuyển cảnh mềm theo câu nhạc.";
    if (n.includes("intro")) note = "Fade-in từ đen, giữ cảnh rộng tuyết rơi lâu để khán giả 'bước vào' mùa Giáng sinh năm đó.";
    else if (n.includes("pre")) note = "Slow-motion 50–60% cho khoảnh khắc tuyết đầu mùa / đèn cây bật sáng.";
    else if (n.includes("final")) note = "Cao trào: xen cảnh vui chơi rộng với cận mặt; slow-motion ở cái ôm, lúc mở quà.";
    else if (n.includes("chorus")) note = "Chuyển cảnh theo tiếng chuông, xen cảnh vui chơi và cận cảnh nụ cười.";
    else if (n.includes("bridge")) note = "Giảm nhịp, dùng dissolve qua ánh nến và tuyết rơi cho khoảnh khắc lắng.";
    else if (n.includes("outro")) note = "Giữ cảnh rộng cuối thật lâu, fade out theo nốt nhạc cuối.";
    return { section: s.name, note_vi: note };
  });
  return loop ? [...notes, loopNote(plan)] : notes;
}

/** Sinh toàn bộ MV mẫu, cùng cấu trúc với kết quả của Claude. */
export function mockGenerate(ctx: GenContext): RawGeneration {
  const bible = castOf(ctx);
  const used = new Set<string>();
  const shots = ctx.plan.shots.map((slot) => mockShot(ctx, slot, 0, used));
  const place = ctx.locationKey ?? ctx.idea.world_location;
  const title = ctx.idea.song_title || `Christmas in ${place}`;
  const length = videoLengthLabel(ctx.settings.videoMinutes ?? 60);
  // MV một bài: tiêu đề theo tên bài, không ghi độ dài, không ghép vòng lặp.
  const single = ctx.idea.video_kind === "mv";
  const outlineParts = ctx.idea.outline.split(/[;.]/).map((x) => x.trim()).filter(Boolean);
  const who = bible.length ? `${bible
    .slice(0, 2)
    .map((c) => `{{${c.id}}}`)
    .join(" and ")} by a glowing Christmas tree` : `a glowing Christmas tree in a snowy window`;
  return {
    character_bible: bible,
    story_arc: ctx.plan.sections.map((s, i) => ({
      section: s.name,
      beat_vi: `${s.role_vi}${outlineParts.length ? ` — ${outlineParts[Math.min(outlineParts.length - 1, Math.floor((i * outlineParts.length) / ctx.plan.sections.length))]}` : ""}`,
    })),
    shots,
    thumbnail_prompt: `Cinematic 16:9 still of ${who} at ${ctx.location.landmarks[0] ?? place}, ${warmPlace(ctx) ? "palm trees wrapped in lights" : "snow falling"}, warm golden glow of colored bulbs, period-accurate ${ctx.year} Christmas details`,
    // MV một bài: bài chọn lúc ghép nhạc, app đặt tên bài lên đầu tiêu đề (MV cũ đã có tên bài thì dùng luôn).
    youtube_titles: single
      ? ctx.idea.song_title
        ? [
            `${title} 🎄 Vintage 1950s Christmas Music Video`,
            `${title} (${ctx.year}) | Old-Fashioned Christmas Song in ${place}`,
            `${title} — A Cozy Vintage Christmas in ${place}, ${ctx.year}`,
          ]
        : [
            `Christmas in ${place}, ${ctx.year} 🎄 Vintage 1950s Christmas Music Video`,
            `Old-Fashioned Christmas in ${place} (${ctx.year}) | Classic Christmas Song`,
            `A Cozy Vintage Christmas in ${place}, ${ctx.year}`,
          ]
      : [
          `${title} ${ctx.year} 🎄 Vintage 1950s Christmas Music (${length})`,
          `Old-Fashioned Christmas in ${place} | 1950s Holiday Songs, ${length}`,
          `${place}, ${ctx.year}: A Cozy Vintage Christmas (${length} of Classic Christmas Music)`,
        ],
    youtube_description: `Pull up a chair by the fire and step into a ${ctx.year} Christmas in ${place}. Snow drifts past glowing windows, colored bulbs twinkle on every porch and the whole town hums a carol. "${title}" is a love letter to the golden age of Christmas — ${ctx.theme.mood}. ${single ? "Let this vintage holiday song play while" : "Let these vintage holiday songs play while"} you wrap presents, bake cookies or simply watch the snow fall.\n\n#christmasmusic #vintagechristmas #1950s #oldieschristmas #${place.replace(/[^A-Za-z0-9]+/g, "").toLowerCase()}`,
    editing_notes: mockEditingNotes(ctx.plan, ctx.settings.loopScenes && !single),
  };
}

export function mockLocation(name: string, year: number, eraYear: EraYear): RawLocation {
  return {
    landmarks: [
      `${name} main street hung with evergreen garlands and colored bulb lights`,
      `a snowy town square in ${name} with a lit Christmas tree`,
      `shop windows of ${name} glowing with toys and tinsel`,
      `${name} rooftops and chimneys under falling snow`,
    ],
    vehicles: eraYear.vehicles.slice(0, 4),
    wardrobe: eraYear.fashion.slice(0, 2),
    props: eraYear.props.slice(0, 4),
    light: "pale winter daylight, then colored bulbs and warm windows at dusk",
    notes: `Địa điểm tự sinh (chế độ demo) cho Giáng sinh năm ${year} — hãy bổ sung chi tiết thật.`,
    forbidden: [],
  };
}

// ---------- Ý tưởng mới (kho ý tưởng sắp hết) ----------

const IDEA_PLACES = [
  "Rockefeller Center",
  "Woodstock Vermont",
  "State Street Chicago",
  "Beacon Hill Boston",
  "Bethlehem Pennsylvania",
  "Central Park",
  "Stowe Ski Lodge",
  "Main Street",
  "Midwest Farmhouse",
  "Grand Central Terminal",
  "Hollywood Boulevard",
  "Miami Beach",
];
const IDEA_MOMENTS = ["Christmas Eve", "First Snow", "Christmas Morning", "Tree Lot Evening", "Carol Night", "New Year's Eve"];
// Ý tưởng tự nghĩ luôn là "chỉ cảnh": các cảnh Giáng sinh nối tiếp nhau của một vùng đất, không nhân vật chính.
const IDEA_STORIES = [
  (p: string) => `Chỉ cảnh, không nhân vật chính: ${p} mùa Giáng sinh — tuyết rơi, đèn phố, người hát mừng và những ô cửa ấm áp.`,
  (p: string) => `Chỉ cảnh, không nhân vật chính: chợ cây thông và các cửa hàng trang trí ở ${p}, xe ngựa kéo và khói bếp trên mái nhà.`,
  (p: string) => `Chỉ cảnh, không nhân vật chính: những con phố ${p} đêm Giáng sinh, cây thông bên cửa sổ, nhà thờ sáng nến.`,
  (p: string) => `Chỉ cảnh, không nhân vật chính: ${p} sáng Giáng sinh — tuyết phủ, quà dưới cây thông, đường sá yên ắng.`,
  (p: string) => `Chỉ cảnh, không nhân vật chính: tàu hơi nước chạy qua tuyết tới ${p}, nhà ga treo vòng nguyệt quế, phố chợ đông vui.`,
];

/** Ý tưởng mẫu cho chế độ demo: ghép địa điểm + thời điểm mùa lễ + năm chưa có trong kho, chủ đề ít dùng nhất. */
export function mockIdeas(count: number, existing: { world_location: string }[], themes: { code: string; used: number }[]): RawIdeaBatch {
  const taken = new Set(existing.map((i) => i.world_location.toLowerCase()));
  const used = new Map(themes.map((t) => [t.code, t.used]));
  const ideas: RawIdeaBatch["ideas"] = [];
  let n = 0;
  for (let year = 1950; year <= 1959 && ideas.length < count; year++) {
    for (const place of IDEA_PLACES) {
      for (const moment of IDEA_MOMENTS) {
        if (ideas.length >= count) break;
        const world_location = `${place} ${moment} ${year}`;
        if (taken.has(world_location.toLowerCase())) continue;
        const code = [...used.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "T01";
        used.set(code, (used.get(code) ?? 0) + 1);
        ideas.push({ world_location, theme_code: code, outline: IDEA_STORIES[n++ % IDEA_STORIES.length](place) });
        break; // mỗi địa điểm một ý tưởng cho mỗi năm → đa dạng hơn
      }
    }
  }
  return { series_name: "Demo – New York – New England – Chicago", ideas };
}
