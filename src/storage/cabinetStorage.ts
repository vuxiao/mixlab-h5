import { SavedCocktail } from '../types';

const CABINET_KEY = 'mixlab_cabinet_v1';
const UNLOCKED_KEY = 'mixlab_unlocked_classics_v1';
const SERIAL_KEY = 'mixlab_serial_counter_v1';

export function loadCabinet(): SavedCocktail[] {
  try {
    const raw = localStorage.getItem(CABINET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToCabinet(item: SavedCocktail): SavedCocktail[] {
  const list = loadCabinet();
  const deduped = list.filter((x) => x.id !== item.id);
  const next = [item, ...deduped].slice(0, 60);
  try {
    localStorage.setItem(CABINET_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  return next;
}

export function removeFromCabinet(id: string): SavedCocktail[] {
  const next = loadCabinet().filter((x) => x.id !== id);
  try {
    localStorage.setItem(CABINET_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function loadUnlockedClassics(): string[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function unlockClassic(recipeId: string): string[] {
  const existing = loadUnlockedClassics();
  if (existing.includes(recipeId)) return existing;
  const next = [...existing, recipeId];
  try {
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function allocateSerialNo(): string {
  let num = 1;
  try {
    const raw = localStorage.getItem(SERIAL_KEY);
    num = raw ? parseInt(raw, 10) + 1 : 1;
    if (Number.isNaN(num) || num < 1) num = 1;
    localStorage.setItem(SERIAL_KEY, String(num));
  } catch {
    num = Math.floor(Math.random() * 899) + 100;
  }
  return `ML-${String(num).padStart(3, '0')}`;
}
