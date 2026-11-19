import { GARNISH_MAP, ICE_OPTIONS } from '../data/garnishes';
import { INGREDIENT_MAP } from '../data/ingredients';
import { CLASSIC_RECIPES } from '../data/recipes';
import {
  ClassicRecipe,
  DrinkEvaluation,
  FlavorProfile,
  GarnishId,
  GlassId,
  IceType,
  LiquidLayer,
  PourEntry,
} from '../types';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mixHexColors(hexA: string, hexB: string, ratioB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = clamp(ratioB, 0, 1);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

/** 将同一原料合并，并按真实液体密度从重到轻排序（底 -> 顶） */
export function computeLiquidLayers(pours: PourEntry[]): LiquidLayer[] {
  const totals = new Map<string, number>();
  let totalMl = 0;

  for (const p of pours) {
    if (p.ml <= 0 || !INGREDIENT_MAP[p.ingredientId]) continue;
    totals.set(p.ingredientId, (totals.get(p.ingredientId) ?? 0) + p.ml);
    totalMl += p.ml;
  }

  if (totalMl <= 0) return [];

  const layers: LiquidLayer[] = [];
  totals.forEach((ml, id) => {
    const ing = INGREDIENT_MAP[id];
    layers.push({
      ingredientId: id,
      name: ing.name,
      ml,
      ratio: ml / totalMl,
      color: ing.color,
      opacity: ing.opacity,
      density: ing.density,
    });
  });

  // 密度越大越沉底（排在前面）
  layers.sort((a, b) => b.density - a.density);
  return layers;
}

export function computeTotalMl(pours: PourEntry[]): number {
  return pours.reduce((sum, p) => sum + p.ml, 0);
}

export function hasCarbonatedIngredient(pours: PourEntry[]): boolean {
  return pours.some((p) => p.ml > 0 && INGREDIENT_MAP[p.ingredientId]?.carbonated);
}

/** 根据各原料的显色权重（不透明度 * 体积）计算摇匀后的成品融合色 */
export function computeBlendedColor(pours: PourEntry[]): string {
  const layers = computeLiquidLayers(pours);
  if (layers.length === 0) return '#E5A93C';

  let weightSum = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (const layer of layers) {
    const rgb = hexToRgb(layer.color);
    // 饱和度/不透明度更高的酒液（如蓝柑橘、红石榴、可乐）在混色中更具染色力
    const colorWeight = layer.ml * (0.25 + layer.opacity * 1.35);
    r += rgb.r * colorWeight;
    g += rgb.g * colorWeight;
    b += rgb.b * colorWeight;
    weightSum += colorWeight;
  }

  if (weightSum <= 0) return '#E5A93C';
  return rgbToHex(r / weightSum, g / weightSum, b / weightSum);
}

export function classifyColorFamily(hex: string): DrinkEvaluation['colorFamily'] {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (lum < 0.25) return 'dark';
  if (sat < 0.18 && lum > 0.72) return 'clear';

  // 计算 HSV 色相角
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else hue = ((r - g) / d + 4) * 60;
  }

  if (hue >= 175 && hue <= 255) return 'blue';
  if (hue >= 70 && hue < 175) return 'green';
  if (hue >= 20 && hue < 70) return 'amber';
  if (hue >= 310 || hue < 20) {
    if (lum > 0.58 && sat < 0.72) return 'pink';
    return 'red';
  }
  return 'pink';
}

export function computeAbv(pours: PourEntry[], iceType: IceType, shaken: boolean): number {
  const totalMl = computeTotalMl(pours);
  if (totalMl <= 0) return 0;

  let alcoholMl = 0;
  for (const p of pours) {
    const ing = INGREDIENT_MAP[p.ingredientId];
    if (!ing) continue;
    alcoholMl += p.ml * (ing.abv / 100);
  }

  const iceMeta = ICE_OPTIONS.find((i) => i.id === iceType) ?? ICE_OPTIONS[0];
  const shakeDilution = shaken ? 0.94 : 1.0;
  const effectiveVolume = totalMl / (iceMeta.dilutionFactor * shakeDilution);
  const abv = (alcoholMl / effectiveVolume) * 100;
  return Math.round(abv * 10) / 10;
}

export function computeFlavorProfile(
  pours: PourEntry[],
  iceType: IceType,
  garnishes: GarnishId[],
  shaken: boolean
): FlavorProfile {
  const totalMl = computeTotalMl(pours);
  if (totalMl <= 0) {
    return { sour: 0, sweet: 0, bitter: 0, strong: 0, refreshing: 0 };
  }

  let sour = 0;
  let sweet = 0;
  let bitter = 0;
  let strong = 0;
  let refreshing = 0;

  for (const p of pours) {
    const ing = INGREDIENT_MAP[p.ingredientId];
    if (!ing) continue;
    const ratio = p.ml / totalMl;
    sour += ing.flavor.sour * ratio;
    sweet += ing.flavor.sweet * ratio;
    bitter += ing.flavor.bitter * ratio;
    strong += ing.flavor.strong * ratio;
    refreshing += ing.flavor.refreshing * ratio;
  }

  const iceMeta = ICE_OPTIONS.find((i) => i.id === iceType) ?? ICE_OPTIONS[0];
  refreshing += iceMeta.refreshBoost;
  if (shaken) {
    refreshing += 6;
    strong = Math.max(0, strong - 4);
  }

  for (const gId of garnishes) {
    const garnish = GARNISH_MAP[gId];
    if (!garnish) continue;
    sour += garnish.flavorDelta.sour ?? 0;
    sweet += garnish.flavorDelta.sweet ?? 0;
    bitter += garnish.flavorDelta.bitter ?? 0;
    strong += garnish.flavorDelta.strong ?? 0;
    refreshing += garnish.flavorDelta.refreshing ?? 0;
  }

  return {
    sour: Math.round(clamp(sour)),
    sweet: Math.round(clamp(sweet)),
    bitter: Math.round(clamp(bitter)),
    strong: Math.round(clamp(strong)),
    refreshing: Math.round(clamp(refreshing)),
  };
}

/** 判定是否解锁了 12 款经典隐藏配方之一（严格校验核心占比与额外原料上限 ≤15%） */
export function matchClassicRecipe(pours: PourEntry[]): ClassicRecipe | undefined {
  const layers = computeLiquidLayers(pours);
  if (layers.length < 2) return undefined;

  const totalMl = layers.reduce((sum, l) => sum + l.ml, 0);
  if (totalMl <= 0) return undefined;

  const layerMap = new Map(layers.map((l) => [l.ingredientId, l]));

  // 优先检查所需原料更多的复杂经典配方（如长岛冰茶优先于自由古巴）
  const sortedRecipes = [...CLASSIC_RECIPES].sort(
    (a, b) => b.requiredIds.length - a.requiredIds.length
  );

  for (const recipe of sortedRecipes) {
    // 1. 所有必备原料均需存在，且各自达到合理最低占比（糖浆/浓味辅料 ≥5%，常规原料 ≥8%）
    const allRequiredValid = recipe.requiredIds.every((id) => {
      const layer = layerMap.get(id);
      if (!layer) return false;
      const minRatio = id === 'grenadine' ? 0.05 : 0.08;
      return layer.ratio >= minRatio;
    });
    if (!allRequiredValid) continue;

    // 2. 校验配方之外的额外原料数量及总占比（总占比严格 ≤ 15%，避免 1/3 蓝柑橘误判金汤力）
    const allowed = new Set([...recipe.requiredIds, ...(recipe.optionalIds ?? [])]);
    let extraCount = 0;
    let extraMl = 0;
    layers.forEach((layer) => {
      if (!allowed.has(layer.ingredientId)) {
        extraCount += 1;
        extraMl += layer.ml;
      }
    });

    const maxExtra = recipe.maxExtraIds ?? 0;
    const extraRatio = extraMl / totalMl;
    if (extraCount <= maxExtra && extraRatio <= 0.15) {
      return recipe;
    }
  }

  return undefined;
}

const POETIC_NAMES: Record<
  DrinkEvaluation['colorFamily'],
  Array<{ name: string; enName: string }>
> = {
  blue: [
    { name: '午夜霓虹潮汐', enName: 'Midnight Neon Tide' },
    { name: '太平洋六点雾', enName: 'Pacific 6PM Mist' },
    { name: '蓝调电车微风', enName: 'Blue Tram Breeze' },
    { name: '深海冰川回响', enName: 'Glacier Abyss Echo' },
  ],
  red: [
    { name: '丝绒爵士告白', enName: 'Velvet Jazz Confession' },
    { name: '红宝石深夜电台', enName: 'Ruby Late-Night Radio' },
    { name: '微醺绯色胶片', enName: 'Crimson Film Grain' },
    { name: '罗马假日余晖', enName: 'Roman Twilight Blush' },
  ],
  pink: [
    { name: '玫瑰蒸汽幻想', enName: 'Rose Vapor Reverie' },
    { name: '霓虹樱桃失眠夜', enName: 'Neon Cherry Insomnia' },
    { name: '暮春微甜来信', enName: 'Late Spring Letter' },
    { name: '绯红气泡圆舞曲', enName: 'Blush Fizz Waltz' },
  ],
  amber: [
    { name: '琥珀黑胶慢板', enName: 'Amber Vinyl Adagio' },
    { name: '加州落日公路', enName: 'Sunset Highway 101' },
    { name: '橡木壁炉私语', enName: 'Oak Hearth Whisper' },
    { name: '黄金年代剪影', enName: 'Gilded Era Silhouette' },
  ],
  green: [
    { name: '雨后薄荷温室', enName: 'After-Rain Conservatory' },
    { name: '翡翠海岛明信片', enName: 'Emerald Island Postcard' },
    { name: '仲夏青柠协奏', enName: 'Midsummer Lime Concerto' },
    { name: '森林雾气苏打', enName: 'Forest Mist Spritz' },
  ],
  dark: [
    { name: '暗夜摩卡布鲁斯', enName: 'Nocturne Espresso Blues' },
    { name: '子夜天鹅绒密语', enName: 'Midnight Velvet Secret' },
    { name: '复古焦糖快车', enName: 'Vintage Caramel Express' },
    { name: '地下酒吧通关令', enName: 'Speakeasy Passcode' },
  ],
  clear: [
    { name: '月光水晶私酿', enName: 'Moonlight Crystal Draft' },
    { name: '冰川晚风白噪音', enName: 'Glacier Breeze White Noise' },
    { name: '银色气泡诗行', enName: 'Silver Bubble Verse' },
    { name: '极简主义微醺', enName: 'Minimalist Tipsy' },
  ],
};

function generateOriginalIdentity(
  pours: PourEntry[],
  flavor: FlavorProfile,
  abv: number,
  colorFamily: DrinkEvaluation['colorFamily'],
  hasBubbles: boolean
): { name: string; enName: string; note: string } {
  const hash = pours.reduce((acc, p, idx) => acc + p.ml * (idx + 3) + p.ingredientId.length * 17, 0);
  const pool = POETIC_NAMES[colorFamily];
  const picked = pool[hash % pool.length];

  // 根据主导风味拼装有温度的调酒师评语
  const parts: string[] = [];
  if (abv < 1) {
    parts.push('零酒精无负担特调');
  } else if (abv < 12) {
    parts.push('温柔轻盈的微醺入门度');
  } else if (abv < 24) {
    parts.push('恰到好处的微醺黄金线');
  } else {
    parts.push('极具存在感的深夜烈度');
  }

  const dims: Array<{ key: keyof FlavorProfile; label: string }> = [
    { key: 'sour', label: '明快鲜锐的柑橘果酸' },
    { key: 'sweet', label: '丝绒般顺滑的甜润果香' },
    { key: 'bitter', label: '富有层次的大人系微苦回甘' },
    { key: 'strong', label: '扎实饱满的烈酒骨架' },
    { key: 'refreshing', label: '通透舒爽的冰冽空气感' },
  ];
  dims.sort((a, b) => flavor[b.key] - flavor[a.key]);

  parts.push(`入口先由${dims[0].label}铺陈开来，尾调带着${dims[1].label}`);
  if (hasBubbles) {
    parts.push('绵密升腾的气泡让每一口都像在舌尖轻舞。');
  } else {
    parts.push('收口圆润细腻，适合配一首慢节奏爵士乐细细品尝。');
  }

  return {
    name: picked.name,
    enName: picked.enName,
    note: parts.join('，'),
  };
}

export function evaluateCocktail(params: {
  pours: PourEntry[];
  glassId: GlassId;
  iceType: IceType;
  garnishes: GarnishId[];
  shaken: boolean;
  serialNo: string;
}): DrinkEvaluation {
  const { pours, glassId, iceType, garnishes, shaken, serialNo } = params;
  const totalMl = computeTotalMl(pours);
  const abv = computeAbv(pours, iceType, shaken);
  const flavor = computeFlavorProfile(pours, iceType, garnishes, shaken);
  const blendedColor = computeBlendedColor(pours);
  const colorFamily = classifyColorFamily(blendedColor);
  const hasBubbles = hasCarbonatedIngredient(pours);
  const classic = matchClassicRecipe(pours);

  if (classic) {
    return {
      serialNo,
      name: classic.name,
      enName: classic.enName,
      isClassic: true,
      classicRecipe: classic,
      bartenderNote: classic.tastingNote,
      abv,
      totalMl,
      flavor,
      blendedColor,
      colorFamily,
      hasBubbles,
      glassId,
      iceType,
      garnishes: [...garnishes],
      pours: pours.map((p) => ({ ...p })),
      shaken,
      createdAt: new Date().toISOString(),
    };
  }

  const original = generateOriginalIdentity(pours, flavor, abv, colorFamily, hasBubbles);
  return {
    serialNo,
    name: original.name,
    enName: original.enName,
    isClassic: false,
    bartenderNote: original.note,
    abv,
    totalMl,
    flavor,
    blendedColor,
    colorFamily,
    hasBubbles,
    glassId,
    iceType,
    garnishes: [...garnishes],
    pours: pours.map((p) => ({ ...p })),
    shaken,
    createdAt: new Date().toISOString(),
  };
}
