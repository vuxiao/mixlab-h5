import React from 'react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { FlavorProfile } from '../types';

interface FlavorRadarChartProps {
  flavor: FlavorProfile;
  size?: number;
  theme?: 'dark' | 'light';
  /** 首次出现时多边形从中心生长 */
  animate?: boolean;
}

const AXES: Array<{ key: keyof FlavorProfile; label: string }> = [
  { key: 'sour', label: '酸' },
  { key: 'sweet', label: '甜' },
  { key: 'bitter', label: '苦' },
  { key: 'strong', label: '烈' },
  { key: 'refreshing', label: '清爽' },
];

export const FlavorRadarChart: React.FC<FlavorRadarChartProps> = ({
  flavor,
  size = 176,
  theme = 'dark',
  animate = false,
}) => {
  const grow = useAnimatedNumber(1, 820, animate ? 0 : 1);
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = size * 0.33;

  const getPoint = (axisIdx: number, scale: number) => {
    const angle = -Math.PI / 2 + (axisIdx * Math.PI * 2) / 5;
    return {
      x: cx + Math.cos(angle) * radius * scale,
      y: cy + Math.sin(angle) * radius * scale,
    };
  };

  const dataPoints = AXES.map((axis, idx) => {
    // 从 0 起算，真实反映小数值（旧版下限 10 会让 0 值也有一块面积）
    const val = (Math.min(100, Math.max(0, flavor[axis.key])) / 100) * grow;
    return getPoint(idx, val);
  });

  const dataPath =
    dataPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ' Z';

  const gridStroke = theme === 'dark' ? 'rgba(200, 155, 84, 0.34)' : 'rgba(143, 29, 44, 0.38)';
  const labelColor = theme === 'dark' ? '#E6D9C3' : '#2B1912';
  const valueColor = theme === 'dark' ? '#E5A93C' : '#8F1D2C';
  const polyFill = theme === 'dark' ? 'rgba(229, 169, 60, 0.25)' : 'rgba(143, 29, 44, 0.24)';
  const polyStroke = theme === 'dark' ? '#E5A93C' : '#8F1D2C';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="select-none overflow-visible"
      role="img"
      aria-label="五维风味雷达图"
    >
      {/* 三层五边形网格 */}
      {[0.35, 0.68, 1].map((scale) => {
        const pts = AXES.map((_, idx) => getPoint(idx, scale));
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
        return <path key={scale} d={d} fill="none" stroke={gridStroke} strokeWidth="1" />;
      })}

      {/* 放射轴线 */}
      {AXES.map((axis, idx) => {
        const end = getPoint(idx, 1);
        return (
          <line
            key={axis.key}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke={gridStroke}
            strokeWidth="1"
          />
        );
      })}

      {/* 数据区域 */}
      <path
        d={dataPath}
        fill={polyFill}
        stroke={polyStroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* 数据顶点 */}
      {dataPoints.map((p, idx) => (
        <circle
          key={AXES[idx].key}
          cx={p.x}
          cy={p.y}
          r="3.2"
          fill={polyStroke}
          stroke={theme === 'dark' ? '#120B08' : '#F5EBD6'}
          strokeWidth="1.2"
        />
      ))}

      {/* 维度标签 + 数值 */}
      {AXES.map((axis, idx) => {
        const lp = getPoint(idx, 1.32);
        return (
          <g key={axis.key} transform={`translate(${lp.x.toFixed(1)}, ${lp.y.toFixed(1)})`}>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              y="-5"
              fill={labelColor}
              fontSize="11"
              fontWeight="600"
            >
              {axis.label}
            </text>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              y="8"
              fill={valueColor}
              fontSize="9.5"
              fontFamily='"JetBrains Mono", Menlo, monospace'
              fontWeight="600"
            >
              {Math.round(flavor[axis.key])}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
