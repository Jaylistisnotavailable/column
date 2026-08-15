import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  AppBar, Toolbar, Typography, Container, Grid, Box,
  Button, CircularProgress,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ColumnInputs from './components/ColumnInputs';
import SectionSVG from './components/SectionSVG';
import NMChart3D from './components/NMChart3D';
import ControlPointsTable from './components/ControlPointsTable';
import { getConcreteParams, STEEL_GRADES, ES } from './utils/materials';
import { buildBars, computeUniaxial, buildBiaxialSurface } from './utils/section';
import { exportColumnPdf } from './utils/exportPdf';

// ★ 新默认参数：纵筋/箍筋强度分开；X、Y 向中部筋与肢数分开
const DEFAULTS = {
  b: '400', h: '600', cover: '30',
  concreteGrade: 'C30',
  steelGradeLong: 'HRB400',     // 纵向钢筋强度等级
  steelGradeStirrup: 'HPB300',  // 箍筋强度等级
  dCorner: 20,
  nSideX: '2', dSideX: 18,      // X 向中部筋（上、下边）
  nSideY: '2', dSideY: 18,      // Y 向中部筋（左、右边）
  dStirrup: 8, sStirrup: '100',
  legsX: 4, legsY: 4,           // 箍筋肢数分方向
};

export default function App() {
  const [params, setParams] = useState(DEFAULTS);
  const setParam = useCallback((k, v) => setParams(p => ({ ...p, [k]: v })), []);

  const [exporting, setExporting] = useState(false);
  const svgRef = useRef(null);
  const plotGdRef = useRef(null);

  // ======================= 核心计算 =======================
  const model = useMemo(() => {
    const num = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
    const clamp = (x, a, c) => Math.min(Math.max(x, a), c);

    const b = clamp(num(params.b, 400), 100, 3000);
    const h = clamp(num(params.h, 600), 100, 3000);
    const cover = clamp(num(params.cover, 30), 10, 120);
    const nSideX = Math.round(clamp(num(params.nSideX, 0), 0, 10));
    const nSideY = Math.round(clamp(num(params.nSideY, 0), 0, 10));
    const sStirrup = clamp(num(params.sStirrup, 100), 20, 500);
    const { dCorner, dSideX, dSideY, dStirrup, legsX, legsY } = params;

    // ---- 材料：混凝土 + 纵筋 + 箍筋（强度分开） ----
    const concrete = { grade: params.concreteGrade, ...getConcreteParams(params.concreteGrade) };
    const steelLong = { grade: params.steelGradeLong, fy: STEEL_GRADES[params.steelGradeLong].fy, Es: ES };
    const steelStirrup = { grade: params.steelGradeStirrup, fy: STEEL_GRADES[params.steelGradeStirrup].fy };

    // ---- 配筋布置（N-M 计算只用纵筋强度；箍筋强度仅用于展示） ----
    const bars = buildBars(b, h, cover, dStirrup, dCorner, nSideX, dSideX, nSideY, dSideY);
    const As = bars.reduce((acc, br) => acc + br.A, 0);
    const rho = As / (b * h) * 100;

    // ---- 两个方向的单向 N-M 曲线 ----
    const rawX = computeUniaxial({ b, h, bars, concrete, steel: steelLong }, 'x');
    const rawY = computeUniaxial({ b, h, bars, concrete, steel: steelLong }, 'y');

    const toK = pts => pts.map(p => ({ N: p.N / 1e3, M: p.M / 1e6 }));
    const ptsX = toK(rawX.points).concat([{ N: rawX.N0 / 1e3, M: 0 }]);
    const ptsY = toK(rawY.points).concat([{ N: rawY.N0 / 1e3, M: 0 }]);
    const N0 = rawX.N0 / 1e3;

    const surface = buildBiaxialSurface(ptsX, ptsY, N0);

    const K_N = 1e-3, K_M = 1e-6;
    const controlPoints = [
      { name: '轴心受压', N: N0, Mx: 0, My: 0, short: '轴压',
        desc: 'N₀ = fc·A + fy·As（未乘 0.9φ 与稳定系数）' },
      { name: 'x 向界限破坏', N: rawX.balanced.N * K_N, Mx: rawX.balanced.M * K_M, My: 0,
        short: '界限(x)', desc: '受拉钢筋屈服与混凝土达到极限压应变同时发生' },
      { name: 'y 向界限破坏', N: rawY.balanced.N * K_N, Mx: 0, My: rawY.balanced.M * K_M,
        short: '界限(y)', desc: '同上（绕 y 轴方向）' },
      { name: 'x 向峰值弯矩', N: rawX.maxMoment.N * K_N, Mx: rawX.maxMoment.M * K_M, My: 0,
        short: 'Mmax(x)', desc: '单向受弯承载力峰值点' },
      { name: 'y 向峰值弯矩', N: rawY.maxMoment.N * K_N, Mx: 0, My: rawY.maxMoment.M * K_M,
        short: 'Mmax(y)', desc: '同上（绕 y 轴方向）' },
      { name: 'x 向纯弯', N: 0, Mx: rawX.pureBending.M * K_M, My: 0,
        short: '纯弯(x)', desc: 'N = 0 时的受弯承载力' },
      { name: 'y 向纯弯', N: 0, Mx: 0, My: rawY.pureBending.M * K_M,
        short: '纯弯(y)', desc: '同上（绕 y 轴方向）' },
      { name: '轴心受拉', N: rawX.tension.N * K_N, Mx: 0, My: 0,
        short: '轴拉', desc: 'Nt = −fy·As' },
    ];

    // ---- 警告（分方向检查净距） ----
    const warnings = [];
    if (2 * (cover + dStirrup + dCorner) >= Math.min(b, h))
      warnings.push('截面尺寸过小，钢筋无法正常布置，请加大截面或减小保护层。');
    if (rho > 5)
      warnings.push(`配筋率 ${rho.toFixed(2)}% 超过 5%，超出规范最大配筋率限值。`);
    if (rho < 0.55)
      warnings.push(`配筋率 ${rho.toFixed(2)}% 低于柱最小配筋率 0.55% 的要求。`);
    if (nSideX > 0) {
      const gap = (b - 2 * cover - 2 * dStirrup - dCorner) / (nSideX + 1) - (dCorner + dSideX) / 2;
      if (gap < 30) warnings.push(`沿 b 边（X向）纵筋净距约 ${Math.max(gap, 0).toFixed(0)} mm < 30 mm，建议调整。`);
    }
    if (nSideY > 0) {
      const gap = (h - 2 * cover - 2 * dStirrup - dCorner) / (nSideY + 1) - (dCorner + dSideY) / 2;
      if (gap < 30) warnings.push(`沿 h 边（Y向）纵筋净距约 ${Math.max(gap, 0).toFixed(0)} mm < 30 mm，建议调整。`);
    }

    return {
      b, h, cover, bars, nSideX, nSideY, dCorner, dSideX, dSideY,
      dStirrup, legsX, legsY, sStirrup,
      concrete, steelLong, steelStirrup, As, rho,
      ptsX, ptsY, surface, controlPoints, warnings,
      summary: { nBars: bars.length, As: As.toFixed(0), rho: rho.toFixed(2), rhoNum: rho },
    };
  }, [params]);

  // ======================= PDF 导出 =======================
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportColumnPdf({ model, plotDiv: plotGdRef.current });
    } catch (e) {
      console.error(e);
      alert('PDF 生成失败：' + e.message);
    } finally {
      setExporting(false);
    }
  }, [exporting, model]);

  const handleGdReady = useCallback(gd => { plotGdRef.current = gd; }, []);

  // ======================= 布局 =======================
  return (
    <Box sx={{ bgcolor: '#f5f6fa', minHeight: '100vh', pb: 4 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            钢筋混凝土柱截面设计 —— N-M 交互分析
          </Typography>
          <Typography variant="body2" sx={{ mr: 3, opacity: 0.8 }}>
            GB 50010 · Material UI · SVG · Plotly.js
          </Typography>
          <Button color="inherit" variant="outlined"
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
            onClick={handleExport} disabled={exporting}>
            {exporting ? '生成中…' : '导出 PDF'}
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <ColumnInputs params={params} setParam={setParam}
              summary={model.summary} warnings={model.warnings} />
          </Grid>

          <Grid item xs={12} md={4}>
            <SectionSVG
              svgRef={svgRef}
              b={model.b} h={model.h} cover={model.cover} bars={model.bars}
              dStirrup={model.dStirrup} legsX={model.legsX} legsY={model.legsY}
              sStirrup={model.sStirrup}
              dCorner={model.dCorner} dSideX={model.dSideX} dSideY={model.dSideY}
              nSideX={model.nSideX} nSideY={model.nSideY}
              concreteGrade={model.concrete.grade} fc={model.concrete.fc}
              steelLongGrade={model.steelLong.grade} fyLong={model.steelLong.fy}
              steelStirGrade={model.steelStirrup.grade} fyStir={model.steelStirrup.fy}
              As={model.As.toFixed(0)} rho={model.rho.toFixed(2)} />
          </Grid>

          <Grid item xs={12} md={5}>
            <NMChart3D surface={model.surface}
              curveX={model.ptsX} curveY={model.ptsY}
              controlPoints={model.controlPoints}
              onGdReady={handleGdReady} />
          </Grid>

          <Grid item xs={12}>
            <ControlPointsTable controlPoints={model.controlPoints} />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}