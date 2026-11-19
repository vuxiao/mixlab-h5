import { GarnishConfig, IceType } from '../types';

export const ICE_OPTIONS: Array<{
  id: IceType;
  name: string;
  enName: string;
  desc: string;
  dilutionFactor: number;
  refreshBoost: number;
}> = [
  {
    id: 'none',
    name: '纯饮无冰',
    enName: 'Neat',
    desc: '原汁纯饮 · 烈香直达',
    dilutionFactor: 1.0,
    refreshBoost: 0,
  },
  {
    id: 'cubes',
    name: '晶莹方冰',
    enName: 'Crystal Cubes',
    desc: '急速降温 · 气泡绝配',
    dilutionFactor: 0.89,
    refreshBoost: 12,
  },
  {
    id: 'sphere',
    name: '匠人大冰球',
    enName: 'Artisan Sphere',
    desc: '慢融锁冷 · 古典气场',
    dilutionFactor: 0.94,
    refreshBoost: 8,
  },
];

export const GARNISHES: GarnishConfig[] = [
  {
    id: 'mint',
    name: '鲜摘薄荷叶',
    enName: 'Fresh Mint',
    flavorDelta: { refreshing: 10 },
    color: '#48A868',
  },
  {
    id: 'rosemary',
    name: '炙烤迷迭香',
    enName: 'Rosemary',
    flavorDelta: { bitter: 5, refreshing: 6 },
    color: '#5D8C5A',
  },
  {
    id: 'lime',
    name: '青柠轮片',
    enName: 'Lime Wheel',
    flavorDelta: { sour: 8, refreshing: 8 },
    color: '#95D144',
  },
  {
    id: 'cherry',
    name: '酒渍红樱桃',
    enName: 'Maraschino Cherry',
    flavorDelta: { sweet: 7 },
    color: '#B9182D',
  },
  {
    id: 'orange_peel',
    name: '烟熏橙皮卷',
    enName: 'Orange Twist',
    flavorDelta: { sweet: 4, bitter: 6, refreshing: 4 },
    color: '#EA8C2A',
  },
];

export const GARNISH_MAP = Object.fromEntries(GARNISHES.map((g) => [g.id, g]));
