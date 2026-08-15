// =====================================================================
// 前端 PDF 导出（jsPDF + jspdf-autotable），不使用截屏
//  1) 参数 / 控制点：矢量文字 + autoTable
//  2) 截面配筋图：jsPDF 绘图指令直接矢量绘制（含 X/Y 向箍筋肢与中部筋）
//  3) 三维图：Plotly.toImage(format:'png', scale:2) 高清位图
// =====================================================================
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Plotly from 'plotly.js-dist-min';

/* ---------------- 中文字体（本地 → CDN → 回退） ---------------- */
const FONT_URLS = [
  `${process.env.PUBLIC_URL}/fonts/NotoSansSC-Regular.ttf`,
  'https://cdn.jsdelivr.net/gh/StellarCN/scp_zh@master/fonts/SimHei.ttf',
];

function isValidTtf(bytes) {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return tag === 'true';
}
function looksLikeVariableFont(bytes) {
  const sig = [0x66, 0x76, 0x61, 0x72];
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n - 4; i++) {
    if (bytes[i] === sig[0] && bytes[i + 1] === sig[1] &&
        bytes[i + 2] === sig[2] && bytes[i + 3] === sig[3]) return true;
  }
  return false;
}
async function fetchFontBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isValidTtf(bytes)) throw new Error('不是有效的 TTF');
  if (looksLikeVariableFont(bytes)) throw new Error('是可变字体，jsPDF 不支持');
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
let fontPromise = null;
async function loadFont() {
  for (const url of FONT_URLS) {
    try { return { base64: await fetchFontBase64(url), url }; }
    catch (e) { console.warn(`[PDF导出] 字体不可用：${url} → ${e.message}`); }
  }
  return null;
}
async function ensureChineseFont(doc) {
  if (!fontPromise) fontPromise = loadFont();
  const got = await fontPromise;
  if (got) {
    try {
      doc.addFileToVFS('zhfont.ttf', got.base64);
      doc.addFont('zhfont.ttf', 'ZhFont', 'normal');
      doc.addFont('zhfont.ttf', 'ZhFont', 'bold');
      doc.setFont('ZhFont', 'normal');
      doc.getStringUnitWidth('中文测试');
      return 'ZhFont';
    } catch (e) {
      console.warn('[PDF导出] 字体校验失败，回退 helvetica：', e);
      doc.setFont('helvetica', 'normal');
      return 'helvetica';
    }
  }
  console.warn('[PDF导出] 未找到可用中文字体。');
  doc.setFont('helvetica', 'normal');
  return 'helvetica';
}

/* =====================================================================
   ★ 截面配筋图矢量绘制（支持 X/Y 向中部筋与分方向箍筋肢）
   ===================================================================== */
function drawSectionPdf(doc, model, font, originX, originY) {
  const {
    b, h, cover, bars, dStirrup, legsX, legsY, sStirrup,
    dCorner, dSideX, dSideY, nSideX, nSideY,
    concrete, steelLong, steelStirrup, As, rho,
  } = model;

  const maxW = 44, maxH = 74;
  const s = Math.min(maxW / b, maxH / h);
  const x0 = originX + 8, y0 = originY + 10;
  const W = b * s, H = h * s;
  const px = x => x0 + (x + b / 2) * s;
  const py = y => y0 + (h / 2 - y) * s;

  const INK = [55, 71, 79], AUX = [144, 164, 174], STIR = [239, 108, 0];

  // 形心轴线
  doc.setDrawColor(...AUX); doc.setLineWidth(0.15);
  doc.setLineDashPattern([2.5, 1, 0.6, 1], 0);
  doc.line(px(-b / 2) - 2, py(0), px(b / 2) + 2, py(0));
  doc.line(px(0), py(h / 2) - 2, px(0), py(-h / 2) + 2);
  doc.setLineDashPattern([], 0);

  // 混凝土轮廓
  doc.setDrawColor(...INK); doc.setLineWidth(0.5);
  doc.setFillColor(236, 239, 241);
  doc.rect(x0, y0, W, H, 'FD');

  // ---- 箍筋：外箍 + X向附加竖向肢 + Y向附加横向肢 ----
  doc.setDrawColor(...STIR);
  doc.setLineWidth(Math.max(dStirrup * s, 0.35));
  doc.rect(px(-b / 2 + cover), py(h / 2 - cover),
    (b - 2 * cover) * s, (h - 2 * cover) * s, 'S');
  const extraV = Math.max(0, legsX - 2);
  for (let i = 1; i <= extraV; i++) {
    const x = -b / 2 + cover + (b - 2 * cover) * i / (extraV + 1);
    doc.line(px(x), py(h / 2 - cover), px(x), py(-h / 2 + cover));
  }
  const extraH = Math.max(0, legsY - 2);
  for (let i = 1; i <= extraH; i++) {
    const y = -h / 2 + cover + (h - 2 * cover) * i / (extraH + 1);
    doc.line(px(-b / 2 + cover), py(y), px(b / 2 - cover), py(y));
  }

  // ---- 纵筋（角筋红 / X向蓝 / Y向绿） ----
  bars.forEach(bar => {
    const r = Math.max(bar.d / 2 * s, 0.5);
    doc.setFillColor(...(bar.type === 'corner' ? [198, 40, 40]
      : bar.type === 'sideX' ? [21, 101, 192] : [46, 125, 50]));
    doc.circle(px(bar.x), py(bar.y), r, 'F');
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.1);
    doc.circle(px(bar.x), py(bar.y), r, 'S');
  });

  // ---- 尺寸 ----
  doc.setDrawColor(...AUX); doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.2, 0.9], 0);
  doc.line(x0, y0, x0, y0 - 6);
  doc.line(x0 + W, y0, x0 + W, y0 - 6);
  doc.line(x0, y0, x0 - 6, y0);
  doc.line(x0, y0 + H, x0 - 6, y0 + H);
  doc.setLineDashPattern([], 0);

  const dimH = (xa, xb, y, label) => {
    doc.setDrawColor(...INK); doc.setLineWidth(0.2);
    doc.line(xa, y, xb, y);
    doc.line(xa - 1, y + 1, xa + 1, y - 1);
    doc.line(xb - 1, y + 1, xb + 1, y - 1);
    doc.setFont(font, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...INK);
    doc.text(label, (xa + xb) / 2, y - 1.2, { align: 'center' });
  };
  const dimV = (ya, yb, x, label) => {
    doc.setDrawColor(...INK); doc.setLineWidth(0.2);
    doc.line(x, ya, x, yb);
    doc.line(x - 1, ya + 1, x + 1, ya - 1);
    doc.line(x - 1, yb + 1, x + 1, yb - 1);
    doc.setFont(font, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...INK);
    doc.text(label, x - 1.5, (ya + yb) / 2, { align: 'center', angle: 90 });
  };
  dimH(x0, x0 + W, y0 - 5, `b = ${b}`);
  dimV(y0, y0 + H, x0 - 5, `h = ${h}`);

  // ---- 右侧引线注释 ----
  const noteX = x0 + W + 4, textX = noteX + 1.5;
  const leader = (fx, fy, ty) => {
    doc.setDrawColor(96, 125, 139); doc.setLineWidth(0.15);
    doc.line(fx, fy, noteX, ty);
    doc.setFillColor(96, 125, 139);
    doc.circle(fx, fy, 0.4, 'F');
  };
  doc.setFont(font, 'normal'); doc.setFontSize(6.8); doc.setTextColor(38, 50, 56);

  const cb = bars.find(p => p.type === 'corner' && p.x > 0 && p.y > 0);
  if (cb) { leader(px(cb.x), py(cb.y), y0 + 2); doc.text(`角筋 4Φ${dCorner}`, textX, y0 + 2.8); }
  const bx = bars.find(p => p.type === 'sideX' && p.y > 0);
  if (bx && nSideX > 0) { leader(px(bx.x), py(bx.y), y0 + 8); doc.text(`X向中部筋 ${nSideX}Φ${dSideX}/边`, textX, y0 + 8.8); }
  const by = bars.find(p => p.type === 'sideY' && p.x > 0);
  if (by && nSideY > 0) { leader(px(by.x), py(by.y), y0 + 14); doc.text(`Y向中部筋 ${nSideY}Φ${dSideY}/边`, textX, y0 + 14.8); }
  const stirTY = Math.max(py(0), y0 + 20);
  leader(px(b / 2 - cover), py(0), stirTY);
  doc.text(`箍筋 Φ${dStirrup}@${sStirrup}（${legsX}×${legsY}肢）`, textX, stirTY + 0.8);

  // ---- 材料信息（纵筋、箍筋强度分开） ----
  doc.setFontSize(6.8); doc.setTextColor(38, 50, 56);
  const infoY = y0 + H + 5;
  doc.text(`混凝土：${concrete.grade}（fc = ${concrete.fc} N/mm²）`, x0 - 6, infoY);
  doc.text(`纵筋：${steelLong.grade}（fy=${steelLong.fy}）；箍筋：${steelStirrup.grade}（fy=${steelStirrup.fy}）`, x0 - 6, infoY + 4);
  doc.text(`As = ${As.toFixed(0)} mm²，ρ = ${rho.toFixed(2)}%，c = ${cover} mm`, x0 - 6, infoY + 8);

  doc.setLineDashPattern([], 0);
  doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0);
  return infoY + 8;
}

/* ---------------- Plotly 高清 PNG ---------------- */
async function getPlotlyPng(plotDiv, width, height, scale = 2) {
  const url = await Plotly.toImage(plotDiv, { format: 'png', width, height, scale });
  if (!url || url.indexOf('data:image/png') !== 0) throw new Error('Plotly PNG 导出失败');
  return url;
}

/* ============================ 主导出函数 ============================ */
export async function exportColumnPdf({ model, plotDiv }) {
  if (!plotDiv) throw new Error('Plotly 图表尚未就绪');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const font = await ensureChineseFont(doc);
  doc.setFont(font, 'normal');

  /* ===== 第 1 页 ===== */
  doc.setFontSize(16);
  doc.text('钢筋混凝土柱截面 N-M 交互分析报告', 105, 16, { align: 'center' });
  doc.setFontSize(9); doc.setTextColor(120, 120, 120);
  doc.text(`生成时间：${new Date().toLocaleString()}`, 105, 22, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // ---- 输入参数表 ----
  const inputRows = [
    ['截面几何', '宽度 b',           `${model.b} mm`],
    ['截面几何', '高度 h',           `${model.h} mm`],
    ['截面几何', '保护层厚度 c',     `${model.cover} mm`],
    ['材料',     '混凝土强度等级',   `${model.concrete.grade}（fc = ${model.concrete.fc} N/mm²）`],
    ['材料',     '纵筋强度等级',     `${model.steelLong.grade}（fy = ${model.steelLong.fy} N/mm²）`],
    ['材料',     '箍筋强度等级',     `${model.steelStirrup.grade}（fy = ${model.steelStirrup.fy} N/mm²）`],
    ['纵向钢筋', '角部钢筋',         `4Φ${model.dCorner}`],
    ['纵向钢筋', 'X向中部钢筋',      `${model.nSideX}Φ${model.dSideX}/边（共 ${model.nSideX * 2} 根，沿 b 边）`],
    ['纵向钢筋', 'Y向中部钢筋',      `${model.nSideY}Φ${model.dSideY}/边（共 ${model.nSideY * 2} 根，沿 h 边）`],
    ['纵向钢筋', '纵筋总根数',       `${model.summary.nBars} 根`],
    ['纵向钢筋', '配筋面积 As',      `${model.As.toFixed(0)} mm²`],
    ['纵向钢筋', '配筋率 ρ',         `${model.rho.toFixed(2)} %`],
    ['箍筋',     '肢数',             `X向 ${model.legsX} 肢 × Y向 ${model.legsY} 肢`],
    ['箍筋',     '箍筋直径',         `Φ${model.dStirrup}`],
    ['箍筋',     '箍筋间距',         `${model.sStirrup} mm`],
  ];
  autoTable(doc, {
    startY: 30,
    head: [['分类', '参数', '取值']],
    body: inputRows,
    theme: 'grid',
    styles: { font, fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { fillColor: [21, 101, 192], font, fontStyle: 'bold' },
    margin: { left: 14, right: 106 },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 34 } },
  });

  // ---- 截面矢量图 ----
  const sectionBottom = drawSectionPdf(doc, model, font, 106, 30);
  doc.setFont(font, 'normal'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
  doc.text('图 1  柱截面配筋图（矢量）', 151, sectionBottom + 5, { align: 'center' });

  // ---- 控制点表 ----
  const cpStartY = Math.max(doc.lastAutoTable.finalY + 8, sectionBottom + 12);
  autoTable(doc, {
    startY: cpStartY,
    head: [['控制点', 'N (kN)', 'Mx (kN·m)', 'My (kN·m)', '说明']],
    body: model.controlPoints.map(p =>
      [p.name, p.N.toFixed(1), p.Mx.toFixed(1), p.My.toFixed(1), p.desc]),
    theme: 'striped',
    styles: { font, fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { fillColor: [21, 101, 192], font, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  /* ===== 第 2 页：三维图 + 说明 ===== */
  doc.addPage();
  doc.setFont(font, 'normal'); doc.setFontSize(14);
  doc.text('三维 N-M 交互曲面（双向偏压）', 105, 16, { align: 'center' });

  const pngUrl = await getPlotlyPng(plotDiv, 900, 580, 2);
  const imgW = 180, imgH = imgW * 580 / 900;
  doc.addImage(pngUrl, 'PNG', 15, 24, imgW, imgH, undefined, 'FAST');
  doc.setFontSize(9);
  doc.text('图 2  N-Mx-My 承载力交互曲面（三维图为 WebGL 渲染，按 Plotly 高清位图导出）',
    105, 24 + imgH + 6, { align: 'center' });

  const notes = [
    '计算说明：',
    '1. 依据 GB 50010 平截面假定与等效矩形应力图（α1·fc，受压区高度 β1·xn）；',
    '2. 纵筋采用理想弹塑性模型（fy 取纵筋强度设计值），Es = 2.0×10⁵ N/mm²；箍筋不计入正截面承载力；',
    '3. 轴心受压 N0 = fc·A + fy·As（未计入 0.9φ 及稳定系数）；',
    '4. 双向偏压曲面按各轴力水平下 Mx/Mux + My/Muy = 1 的线性轮廓近似（偏于保守）。',
  ];
  doc.setFontSize(9);
  let ny = 24 + imgH + 16;
  notes.forEach(line => {
    doc.text(doc.splitTextToSize(line, 180), 15, ny);
    ny += 6;
  });

  /* ===== 页脚 ===== */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(font, 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`第 ${i} / ${pages} 页`, 196, 291, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`柱截面N-M分析报告_${model.b}x${model.h}.pdf`);
}