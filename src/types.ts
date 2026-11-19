export type GlassId = 'martini' | 'rocks' | 'highball';

export type IceType = 'none' | 'cubes' | 'sphere';

export type GarnishId = 'mint' | 'rosemary' | 'lime' | 'cherry' | 'orange_peel';

export type IngredientCategory = 'spirit' | 'liqueur_juice' | 'mixer_syrup';

export type AppStep = 'glass' | 'ice' | 'pour' | 'shake';

export type GameMode = 'free' | 'challenge';

export interface FlavorProfile {
  sour: number;       // 酸 0-100
  sweet: number;      // 甜 0-100
  bitter: number;     // 苦 0-100
  strong: number;     // 烈 0-100
  refreshing: number; // 清爽 0-100
}

export interface Ingredient {
  id: string;
  name: string;
  enName: string;
  category: IngredientCategory;
  abv: number;            // 0 - 45
  density: number;        // 相对密度 0.93 - 1.18 (越大越沉底)
  color: string;          // Hex 主色
  glowColor: string;      // 高光色
  opacity: number;        // 0.35 - 0.96
  carbonated: boolean;    // 是否含碳酸气泡
  shortNote: string;      // 风味短标签
  flavor: FlavorProfile;  // 单品基础风味值
  bottleShape: 'tall' | 'stout' | 'flask' | 'can' | 'syrup';
}

export interface GlassConfig {
  id: GlassId;
  name: string;
  enName: string;
  capacityMl: number;
  tagline: string;
  recommended: string;
}

export interface GarnishConfig {
  id: GarnishId;
  name: string;
  enName: string;
  flavorDelta: Partial<FlavorProfile>;
  color: string;
}

export interface PourEntry {
  ingredientId: string;
  ml: number;
}

export interface LiquidLayer {
  ingredientId: string;
  name: string;
  ml: number;
  ratio: number;       // 占总液体比例
  color: string;
  opacity: number;
  density: number;
}

export interface ClassicRecipe {
  id: string;
  name: string;
  enName: string;
  era: string;
  preferredGlass: GlassId;
  requiredIds: string[];
  optionalIds?: string[];
  maxExtraIds?: number;
  hint: string;
  story: string;
  tastingNote: string;
  accentColor: string;
}

export interface DrinkEvaluation {
  serialNo: string;
  name: string;
  enName: string;
  isClassic: boolean;
  classicRecipe?: ClassicRecipe;
  bartenderNote: string;
  abv: number;
  totalMl: number;
  flavor: FlavorProfile;
  blendedColor: string;
  colorFamily: 'blue' | 'red' | 'amber' | 'green' | 'clear' | 'dark' | 'pink';
  hasBubbles: boolean;
  glassId: GlassId;
  iceType: IceType;
  garnishes: GarnishId[];
  pours: PourEntry[];
  shaken: boolean;
  createdAt: string;
}

export interface ChallengeGuest {
  id: string;
  guestName: string;
  persona: string;
  avatarTheme: 'architect' | 'jazz' | 'illustrator' | 'photographer' | 'chef' | 'poet' | 'dj' | 'editor';
  quote: string;
  tags: string[];
  criteria: {
    minAbv?: number;
    maxAbv?: number;
    minFlavor?: Partial<FlavorProfile>;
    maxFlavor?: Partial<FlavorProfile>;
    preferBubbles?: boolean;
    preferColors?: DrinkEvaluation['colorFamily'][];
    preferGlass?: GlassId;
    preferGarnish?: GarnishId[];
  };
}

export interface ChallengeResult {
  guest: ChallengeGuest;
  stars: number; // 1 - 5
  score: number; // 0 - 100
  feedback: string;
  matchedPoints: string[];
  missedPoints: string[];
}

export interface SavedCocktail extends DrinkEvaluation {
  id: string;
  challengeStars?: number;
  challengeGuestName?: string;
}
