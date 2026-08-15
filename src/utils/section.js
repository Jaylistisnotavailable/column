// =====================================================================
// 截面几何与 N-M 交互曲线计算（形心为原点，x 沿 b，y 沿 h，单位 mm）
// =====================================================================
import { ES } from './materials';

export const barArea = d => Math.PI * d * d / 4;

/**
 * 生成纵筋坐标列表
 * @param dCorner/nSideX/dSideX  角筋直径；X向中部筋（上、下边，沿 b 边分布）根数/直径
 * @param nSideY/dSideY          Y向中部筋（左、右边，沿 h 边分布）根数/直径
 * @returns [{x, y, d, A, type:'corner'|'sideX'|'sideY'}]
 */
export function buildBars(b, h, cover, dStirrup, dCorner, nSideX, dSideX, nSideY, dSideY) {
  // 各类钢筋中心到混凝土边缘的距离 = 保护层 + 箍筋直径 + 自身半径
  const offCorner = cover + dStirrup + dCorner / 2;
  const offX = cover + dStirrup + dSideX / 2;
  const offY = cover + dStirrup + dSideY / 2;
  const cx = Math.max(b / 2 - offCorner, 0); // 角筋 x 坐标绝对值
  const cy = Math.max(h / 2 - offCorner, 0); // 角筋 y 坐标绝对值

  const mk = (x, y, d, type) => ({ x, y, d, A: barArea(d), type });
  // ---- 4 根角筋 ----
  const bars = [
    mk(-cx, -cy, dCorner, 'corner'),
    mk( cx, -cy, dCorner, 'corner'),
    mk( cx,  cy, dCorner, 'corner'),
    mk(-cx,  cy, dCorner, 'corner'),
  ];

  // ---- X 向中部筋：上、下两边，沿 b 边在角筋之间均匀分布 ----
  if (nSideX > 0) {
    const yy = Math.max(h / 2 - offX, 0);
    for (let i = 1; i <= nSideX; i++) {
      const tx = -cx + (2 * cx) * i / (nSideX + 1);
      bars.push(mk(tx, -yy, dSideX, 'sideX')); // 下边
      bars.push(mk(tx,  yy, dSideX, 'sideX')); // 上边
    }
  }

  // ---- Y 向中部筋：左、右两边，沿 h 边在角筋之间均匀分布 ----
  if (nSideY > 0) {
    const xx = Math.max(b / 2 - offY, 0);
    for (let i = 1; i <= nSideY; i++) {
      const ty = -cy + (2 * cy) * i / (nSideY + 1);
      bars.push(mk(-xx, ty, dSideY, 'sideY')); // 左边
      bars.push(mk( xx, ty, dSideY, 'sideY')); // 右边
    }
  }
  return bars;
}

/** 单向偏心受压 N-M 曲线（平截面假定 + 等效矩形应力图），纵筋取各自 fy */
export function computeUniaxial({ b, h, bars, concrete, steel }, axis) {
  const { fc, alpha1, beta1, epsCu } = concrete;
  const { fy } = steel;                        // 纵向钢筋强度设计值
  const width = axis === 'x' ? b : h;          // 受压区宽度
  const half  = axis === 'x' ? h / 2 : b / 2;  // 受压方向半高
  const coord = bar => axis === 'x' ? bar.y : bar.x;

  const evalAt = xn => {
    const a  = Math.min(beta1 * xn, 2 * half);
    const Cc = alpha1 * fc * width * a;
    let N = Cc;
    let M = Cc * (half - a / 2);
    for (const bar of bars) {
      const d   = half - coord(bar);
      const eps = epsCu * (xn - d) / xn;
      const sig = Math.max(-fy, Math.min(fy, ES * eps));
      N += sig * bar.A;
      M += sig * bar.A * coord(bar);
    }
    return { N, M };
  };

  const minC  = Math.min(...bars.map(coord));
  const dMax  = half - minC;
  const xnBal = epsCu / (epsCu + fy / ES) * dMax;

  // 中和轴对数采样 + 界限点加密
  const xs = [];
  const nPts = 100;
  const x0 = 0.04 * dMax, x1 = 3.0 * dMax;
  for (let i = 0; i < nPts; i++) xs.push(x0 * Math.pow(x1 / x0, i / (nPts - 1)));
  xs.push(xnBal * 0.99, xnBal, xnBal * 1.01);
  xs.sort((p, q) => p - q);
  const points = xs.map(xn => ({ xn, ...evalAt(xn) }));

  const AsTotal  = bars.reduce((s, br) => s + br.A, 0);
  const N0       = fc * b * h + fy * AsTotal;
  const balanced = { xn: xnBal, ...evalAt(xnBal) };

  // 纯弯点（N=0 内插）
  let pureBending = { N: 0, M: 0 };
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i], q = points[i + 1];
    if (p.N <= 0 && q.N >= 0 && p.N !== q.N) {
      const t = (0 - p.N) / (q.N - p.N);
      pureBending = { N: 0, M: p.M + t * (q.M - p.M) };
      break;
    }
  }
  const maxMoment = points.reduce((m, p) => (p.M > m.M ? p : m), points[0]);

  return {
    points, N0, balanced, pureBending, maxMoment, dMax, xnBal,
    tension: { N: -fy * AsTotal, M: 0 },
  };
}

/** 单向曲线上轴力 Nt 对应的最大弯矩（包络值） */
export function momentAtN(points, Nt) {
  let best = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], p2 = points[i + 1];
    if ((a.N - Nt) * (p2.N - Nt) <= 0 && a.N !== p2.N) {
      const t = (Nt - a.N) / (p2.N - a.N);
      const M = a.M + t * (p2.M - a.M);
      if (M > best) best = M;
    }
  }
  return best;
}

/** 双向偏压曲面：各轴力水平下 Mx/Mux + My/Muy = 1 线性轮廓 */
export function buildBiaxialSurface(ptsX, ptsY, N0, nLevel = 36, nArc = 25) {
  const X = [], Y = [], Z = [];
  for (let k = 0; k < nLevel; k++) {
    const N  = N0 * k / (nLevel - 1);
    const Mx = momentAtN(ptsX, N);
    const My = momentAtN(ptsY, N);
    const rowX = [], rowY = [], rowZ = [];
    for (let j = 0; j < nArc; j++) {
      const t = j / (nArc - 1);
      rowX.push(Mx * (1 - t));
      rowY.push(My * t);
      rowZ.push(N);
    }
    X.push(rowX); Y.push(rowY); Z.push(rowZ);
  }
  return { X, Y, Z };
}