import { ChallengeGuest, ChallengeResult, DrinkEvaluation, FlavorProfile } from '../types';

const FLAVOR_CN: Record<keyof FlavorProfile, string> = {
  sour: '酸度',
  sweet: '甜度',
  bitter: '苦韵',
  strong: '烈度',
  refreshing: '清爽度',
};

export function judgeChallenge(
  guest: ChallengeGuest,
  drink: DrinkEvaluation
): ChallengeResult {
  const c = guest.criteria;
  let totalChecks = 0;
  let earnedPoints = 0;
  const matchedPoints: string[] = [];
  const missedPoints: string[] = [];

  // 1. 酒精度区间
  if (c.minAbv !== undefined || c.maxAbv !== undefined) {
    totalChecks += 1;
    const minOk = c.minAbv === undefined || drink.abv >= c.minAbv - 1.5;
    const maxOk = c.maxAbv === undefined || drink.abv <= c.maxAbv + 1.5;
    if (minOk && maxOk) {
      earnedPoints += 1;
      matchedPoints.push(`酒精度 ${drink.abv}% 精准拿捏`);
    } else if (c.maxAbv !== undefined && drink.abv > c.maxAbv) {
      earnedPoints += 0.25;
      missedPoints.push(`酒精度略高（期望 ≤${c.maxAbv}%）`);
    } else {
      earnedPoints += 0.25;
      missedPoints.push(`酒精度偏淡（期望 ≥${c.minAbv}%）`);
    }
  }

  // 2. 最低风味达标
  if (c.minFlavor) {
    (Object.keys(c.minFlavor) as Array<keyof FlavorProfile>).forEach((key) => {
      const target = c.minFlavor![key]!;
      totalChecks += 1;
      const val = drink.flavor[key];
      if (val >= target) {
        earnedPoints += 1;
        matchedPoints.push(`${FLAVOR_CN[key]}非常契合 (${val})`);
      } else if (val >= target - 14) {
        earnedPoints += 0.6;
        matchedPoints.push(`${FLAVOR_CN[key]}接近心意`);
      } else {
        missedPoints.push(`${FLAVOR_CN[key]}稍显不足`);
      }
    });
  }

  // 3. 最高风味上限
  if (c.maxFlavor) {
    (Object.keys(c.maxFlavor) as Array<keyof FlavorProfile>).forEach((key) => {
      const limit = c.maxFlavor![key]!;
      totalChecks += 1;
      const val = drink.flavor[key];
      if (val <= limit) {
        earnedPoints += 1;
        matchedPoints.push(`${FLAVOR_CN[key]}克制得体`);
      } else {
        earnedPoints += 0.2;
        missedPoints.push(`${FLAVOR_CN[key]}偏高了些`);
      }
    });
  }

  // 4. 气泡要求
  if (c.preferBubbles) {
    totalChecks += 1;
    if (drink.hasBubbles) {
      earnedPoints += 1;
      matchedPoints.push('绵密气泡感拉满');
    } else {
      missedPoints.push('缺少清爽碳酸气泡');
    }
  }

  // 5. 色系要求
  if (c.preferColors && c.preferColors.length > 0) {
    totalChecks += 1;
    if (c.preferColors.includes(drink.colorFamily)) {
      earnedPoints += 1;
      matchedPoints.push('酒液色泽一眼心动');
    } else {
      earnedPoints += 0.2;
      missedPoints.push('色调与客人想象略有出入');
    }
  }

  // 6. 杯型加分项
  if (c.preferGlass) {
    totalChecks += 0.7;
    if (drink.glassId === c.preferGlass) {
      earnedPoints += 0.7;
      matchedPoints.push('杯型审美完全踩中');
    } else {
      missedPoints.push('换个更搭的杯型会更惊艳');
    }
  }

  // 7. 装饰加分项
  if (c.preferGarnish && c.preferGarnish.length > 0) {
    totalChecks += 0.7;
    if (drink.garnishes.some((g) => c.preferGarnish!.includes(g))) {
      earnedPoints += 0.7;
      matchedPoints.push('装饰细节仪式感满满');
    } else {
      missedPoints.push('少了点睛的小装饰');
    }
  }

  const ratio = totalChecks > 0 ? earnedPoints / totalChecks : 0.8;
  const score = Math.round(Math.min(100, Math.max(20, ratio * 100)));
  let stars = 1;
  if (score >= 88) stars = 5;
  else if (score >= 73) stars = 4;
  else if (score >= 56) stars = 3;
  else if (score >= 40) stars = 2;

  const feedbackMap: Record<number, string> = {
    5: '“神了！这就是我脑海里今晚那一杯的味道，首席调酒师请收下我的小费！”',
    4: '“太懂我了！入口瞬间眼睛一亮，微醺氛围直接拉满，下次还来坐你吧台。”',
    3: '“挺有意思的创意特调，虽然和我原本想的有一点小反差，但意外地顺口。”',
    2: '“嗯……风味有点偏离我的订单，不过敢于实验的精神值得干一杯！”',
    1: '“哈哈这杯完全是个盲盒惊喜！看来今晚咱们得重新对一下暗号了。”',
  };

  return {
    guest,
    stars,
    score,
    feedback: feedbackMap[stars],
    matchedPoints,
    missedPoints,
  };
}
