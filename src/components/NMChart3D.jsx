import React, { useMemo } from 'react';
import Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import { Paper, Typography, Box } from '@mui/material';

const Plot = createPlotlyComponent(Plotly);

/**
 * 三维 N-M 交互图
 * 修改：新增 onGdReady(graphDiv) 回调 —— 把 Plotly 的 DOM 节点传给 App，
 *       PDF 导出时用 Plotly.toImage(format:'svg') 生成矢量 SVG
 */
export default function NMChart3D({ surface, curveX, curveY, controlPoints, onGdReady }) {
  const data = useMemo(() => {
    const traces = [];

    // 1) 双向承载力曲面
    traces.push({
      type: 'surface',
      x: surface.X, y: surface.Y, z: surface.Z,
      colorscale: 'Viridis', opacity: 0.7,
      contours: { z: { show: true, usecolormap: true, highlightwidth: 2 } },
      colorbar: { title: 'N(kN)', len: 0.75 },
      showlegend: false, name: '双向偏压曲面',
    });

    // 2) 单向 Mx-N 曲线
    traces.push({
      type: 'scatter3d', mode: 'lines', name: '单向 Mx-N',
      x: curveX.map(p => p.M), y: curveX.map(() => 0), z: curveX.map(p => p.N),
      line: { color: '#d32f2f', width: 5 },
    });

    // 3) 单向 My-N 曲线
    traces.push({
      type: 'scatter3d', mode: 'lines', name: '单向 My-N',
      x: curveY.map(() => 0), y: curveY.map(p => p.M), z: curveY.map(p => p.N),
      line: { color: '#1565c0', width: 5 },
    });

    // 4) 控制点
    traces.push({
      type: 'scatter3d', mode: 'markers+text', name: '控制点',
      x: controlPoints.map(p => p.Mx),
      y: controlPoints.map(p => p.My),
      z: controlPoints.map(p => p.N),
      text: controlPoints.map(p => p.short),
      textposition: 'top center',
      marker: { size: 5, color: '#ff6f00', symbol: 'diamond' },
      hovertemplate: controlPoints.map(p =>
        `<b>${p.name}</b><br>N = %{z:.1f} kN<br>Mx = %{x:.1f} kN·m<br>My = %{y:.1f} kN·m<extra></extra>`),
    });

    return traces;
  }, [surface, curveX, curveY, controlPoints]);

  const layout = useMemo(() => ({
    autosize: true, height: 580,
    margin: { l: 0, r: 0, t: 10, b: 0 },
    scene: {
      xaxis: { title: 'Mx (kN·m)' },
      yaxis: { title: 'My (kN·m)' },
      zaxis: { title: 'N (kN)' },
      camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } },
    },
    legend: { x: 0, y: 1.05, orientation: 'h' },
  }), []);

  return (
    <Paper sx={{ p: 1.5, height: '100%' }}>
      <Typography variant="h6">三维 N-M 交互曲面（双向偏压）</Typography>
      <Typography variant="caption" color="text.secondary">
        曲面按各轴力水平 Mx/Mux + My/Muy = 1 的线性轮廓近似（保守）
      </Typography>
      <Box sx={{ width: '100%' }}>
        <Plot data={data} layout={layout} useResize
          style={{ width: '100%' }}
          config={{ responsive: true, displaylogo: false }}
          /* ★ 初始化与更新时都把 graph div 传给父组件，供 PDF 导出使用 */
          onInitialized={(fig, gd) => onGdReady && onGdReady(gd)}
          onUpdate={(fig, gd) => onGdReady && onGdReady(gd)} />
      </Box>
    </Paper>
  );
}