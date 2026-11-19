import { GlassConfig } from '../types';

export const GLASSES: GlassConfig[] = [
  {
    id: 'martini',
    name: '马天尼杯',
    enName: 'Martini Glass',
    capacityMl: 210,
    tagline: '优雅 V 型宽口 · 释放花果香气',
    recommended: '大都会 / 蓝色泻湖 / 短饮特调',
  },
  {
    id: 'rocks',
    name: '古典威士忌杯',
    enName: 'Rocks Glass',
    capacityMl: 240,
    tagline: '厚底水晶切面 · 绝配匠人大冰球',
    recommended: '内格罗尼 / 威士忌酸 / 烈酒慢饮',
  },
  {
    id: 'highball',
    name: '修长高球杯',
    enName: 'Highball Glass',
    capacityMl: 240,
    tagline: '纤长直筒杯壁 · 绝美分层与升腾气泡',
    recommended: '金汤力 / 莫吉托 / 龙舌兰日出',
  },
];

export const GLASS_MAP = Object.fromEntries(GLASSES.map((g) => [g.id, g]));
