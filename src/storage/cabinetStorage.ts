import { CLASSIC_RECIPES } from '../data/recipes';
import { GLASS_MAP } from '../data/glasses';
import { GARNISH_MAP } from '../data/garnishes';
import { INGREDIENT_MAP } from '../data/ingredients';
import {
  DrinkEvaluation,
  FlavorProfile,
  GarnishId,
  GlassId,
  IceType,
  PourEntry,
  SavedCocktail,
} from '../types';

export const STORAGE_KEYS = {
  cabinet: 'mixlab_cabinet_v1',
  unlocked: 'mixlab_unlocked_classics_v1',
  serial: 'mixlab_serial_counter_v1',
  sound: 'mixlab_sound_on_v1',
  entered: 'mixlab_entered_session_v1',
} as const;

const CABINET_LIMIT = 60;

export interface StorageResult<T> {
  ok: boolean;
  list: T;
}

/* ------------------------------------------------------------------ */
/* 安全读写                                                             */
/* ------------------------------------------------------------------ */

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    // 某些隐私模式 setItem 不抛错但写不进去，回读确认
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function readJsonArray(key: string): unknown[] {
  const raw = safeGet(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Schema 校验 / 迁移：过滤坏条目，修补可修复字段                          */
/* ------------------------------------------------------------------ */

const ICE_TYPES: IceType[] = ['none', 'cubes', 'sphere'];
const COLOR_FAMILIES: DrinkEvaluation['colorFamily'][] = [
  'blue',
  'red',
  'amber',
  'green',
  'clear',
  'dark',
  'pink',
];
const FLAVOR_KEYS: Array<keyof FlavorProfile> = ['sour', 'sweet', 'bitter', 'strong', 'refreshing'];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function sanitizePours(v: unknown): PourEntry[] | null {
  if (!Array.isArray(v)) return null;
  const pours: PourEntry[] = [];
  for (const p of v) {
    if (!isObj(p)) continue;
    if (typeof p.ingredientId !== 'string' || !INGREDIENT_MAP[p.ingredientId]) continue;
    if (!isFiniteNum(p.ml) || p.ml <= 0) continue;
    pours.push({ ingredientId: p.ingredientId, ml: Math.round(p.ml) });
  }
  return pours.length > 0 ? pours : null;
}

function sanitizeFlavor(v: unknown): FlavorProfile | null {
  if (!isObj(v)) return null;
  const out = {} as FlavorProfile;
  for (const key of FLAVOR_KEYS) {
    const val = v[key];
    if (!isFiniteNum(val)) return null;
    out[key] = clamp(val, 0, 100);
  }
  return out;
}

export function sanitizeSavedCocktail(v: unknown): SavedCocktail | null {
  if (!isObj(v)) return null;
  if (!nonEmptyStr(v.id) || !nonEmptyStr(v.serialNo) || !nonEmptyStr(v.name)) return null;
  if (!isFiniteNum(v.abv)) return null;

  const pours = sanitizePours(v.pours);
  const flavor = sanitizeFlavor(v.flavor);
  if (!pours || !flavor) return null;

  const glassId: GlassId =
    typeof v.glassId === 'string' && GLASS_MAP[v.glassId as GlassId] ? (v.glassId as GlassId) : 'highball';
  const iceType: IceType = ICE_TYPES.includes(v.iceType as IceType) ? (v.iceType as IceType) : 'cubes';
  const garnishes: GarnishId[] = Array.isArray(v.garnishes)
    ? (v.garnishes.filter((g) => typeof g === 'string' && GARNISH_MAP[g]) as GarnishId[]).slice(0, 2)
    : [];
  const totalMl = pours.reduce((s, p) => s + p.ml, 0);
  const blendedColor =
    typeof v.blendedColor === 'string' && /^#[0-9a-f]{6}$/i.test(v.blendedColor)
      ? v.blendedColor
      : '#C88928';
  const colorFamily = COLOR_FAMILIES.includes(v.colorFamily as DrinkEvaluation['colorFamily'])
    ? (v.colorFamily as DrinkEvaluation['colorFamily'])
    : 'amber';
  const createdAt =
    typeof v.createdAt === 'string' && !Number.isNaN(Date.parse(v.createdAt))
      ? v.createdAt
      : new Date().toISOString();

  // 经典配方以当前数据为准重新挂载，避免旧结构残留
  const classicId = isObj(v.classicRecipe) && typeof v.classicRecipe.id === 'string' ? v.classicRecipe.id : null;
  const classicRecipe = classicId ? CLASSIC_RECIPES.find((r) => r.id === classicId) : undefined;

  const stars = isFiniteNum(v.challengeStars) ? clamp(Math.round(v.challengeStars), 1, 5) : undefined;

  return {
    id: v.id,
    serialNo: v.serialNo,
    name: v.name,
    enName: typeof v.enName === 'string' ? v.enName : '',
    isClassic: Boolean(classicRecipe),
    classicRecipe,
    bartenderNote: typeof v.bartenderNote === 'string' ? v.bartenderNote : '',
    abv: clamp(v.abv, 0, 100),
    totalMl,
    flavor,
    blendedColor,
    colorFamily,
    hasBubbles: Boolean(v.hasBubbles),
    glassId,
    iceType,
    garnishes,
    pours,
    shaken: Boolean(v.shaken),
    createdAt,
    challengeStars: stars,
    challengeGuestName: typeof v.challengeGuestName === 'string' ? v.challengeGuestName : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* 酒柜                                                                */
/* ------------------------------------------------------------------ */

export function loadCabinet(): SavedCocktail[] {
  const rawList = readJsonArray(STORAGE_KEYS.cabinet);
  const seen = new Set<string>();
  const list: SavedCocktail[] = [];
  for (const raw of rawList) {
    const item = sanitizeSavedCocktail(raw);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      list.push(item);
    }
  }
  // 发现脏数据时顺手修复存储，下次读取更快更干净
  if (list.length !== rawList.length) {
    safeSet(STORAGE_KEYS.cabinet, JSON.stringify(list));
  }
  return list;
}

export function saveToCabinet(item: SavedCocktail): StorageResult<SavedCocktail[]> {
  const current = loadCabinet();
  const next = [item, ...current.filter((x) => x.id !== item.id)].slice(0, CABINET_LIMIT);
  const ok = safeSet(STORAGE_KEYS.cabinet, JSON.stringify(next));
  return { ok, list: ok ? next : current };
}

export function removeFromCabinet(id: string): StorageResult<SavedCocktail[]> {
  const current = loadCabinet();
  const next = current.filter((x) => x.id !== id);
  const ok = safeSet(STORAGE_KEYS.cabinet, JSON.stringify(next));
  return { ok, list: ok ? next : current };
}

/* ------------------------------------------------------------------ */
/* 经典图鉴                                                             */
/* ------------------------------------------------------------------ */

const CLASSIC_IDS = new Set(CLASSIC_RECIPES.map((r) => r.id));

export function loadUnlockedClassics(): string[] {
  const raw = readJsonArray(STORAGE_KEYS.unlocked);
  return Array.from(new Set(raw.filter((x): x is string => typeof x === 'string' && CLASSIC_IDS.has(x))));
}

export function unlockClassic(recipeId: string): StorageResult<string[]> {
  const existing = loadUnlockedClassics();
  if (existing.includes(recipeId)) return { ok: true, list: existing };
  const next = [...existing, recipeId];
  const ok = safeSet(STORAGE_KEYS.unlocked, JSON.stringify(next));
  // 写入失败也在本次会话内点亮，避免用户困惑；刷新后会丢失
  return { ok, list: next };
}

/* ------------------------------------------------------------------ */
/* 序列号：设备内自增 + 随机后缀，保证不同用户之间几乎不会撞号                 */
/* ------------------------------------------------------------------ */

const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomSuffix(len = 4): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => SERIAL_ALPHABET[b % SERIAL_ALPHABET.length]).join('');
}

export function allocateSerialNo(): string {
  const raw = safeGet(STORAGE_KEYS.serial);
  let num = raw ? parseInt(raw, 10) + 1 : 1;
  if (!Number.isFinite(num) || num < 1) num = 1;
  safeSet(STORAGE_KEYS.serial, String(num));
  return `ML-${String(num).padStart(3, '0')}-${randomSuffix()}`;
}

/* ------------------------------------------------------------------ */
/* 偏好与会话                                                           */
/* ------------------------------------------------------------------ */

export function loadSoundPref(): boolean {
  return safeGet(STORAGE_KEYS.sound) !== '0';
}

export function saveSoundPref(on: boolean): void {
  safeSet(STORAGE_KEYS.sound, on ? '1' : '0');
}

export function hasEnteredThisSession(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.entered) === '1';
  } catch {
    return false;
  }
}

export function markEnteredThisSession(): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.entered, '1');
  } catch {
    // ignore
  }
}

/** 兜底：清空本应用所有本地数据 */
export function clearAllLocalData(): void {
  try {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem(STORAGE_KEYS.entered);
  } catch {
    // ignore
  }
}
