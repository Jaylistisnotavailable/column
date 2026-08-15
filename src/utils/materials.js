// =====================================================================
// 材料参数（设计值取自《混凝土结构设计规范》GB 50010-2010）
// =====================================================================

// 混凝土轴心抗压强度设计值 fc、轴心抗拉强度设计值 ft（N/mm²）
export const CONCRETE_GRADES = {
  C20: { fc: 9.6,  ft: 1.10 },
  C25: { fc: 11.9, ft: 1.27 },
  C30: { fc: 14.3, ft: 1.43 },
  C35: { fc: 16.7, ft: 1.57 },
  C40: { fc: 19.1, ft: 1.71 },
  C45: { fc: 21.1, ft: 1.80 },
  C50: { fc: 23.1, ft: 1.89 },
  C55: { fc: 25.3, ft: 1.96 },
  C60: { fc: 27.5, ft: 2.04 },
  C65: { fc: 29.7, ft: 2.09 },
  C70: { fc: 31.8, ft: 2.14 },
  C75: { fc: 33.8, ft: 2.18 },
  C80: { fc: 35.9, ft: 2.22 },
};

// 钢筋抗拉强度设计值 fy（N/mm²），箍筋与纵筋共用该等级输入
export const STEEL_GRADES = {
  HPB300:  { fy: 270 },
  HRB335:  { fy: 300 },
  HRB400:  { fy: 360 },
  HRBF400: { fy: 360 },
  RRB400:  { fy: 360 },
  HRB500:  { fy: 435 },
};

export const ES = 2.0e5; // 钢筋弹性模量 Es（N/mm²）

/**
 * 按混凝土等级返回 fc / ft 以及等效矩形应力图参数：
 *   ≤C50: α1=1.00, β1=0.80, εcu=0.0033
 *   C80 : α1=0.94, β1=0.74, εcu=0.0030
 * 中间等级按线性插值（规范规定）。
 */
export function getConcreteParams(grade) {
  const g = CONCRETE_GRADES[grade];
  const order = Object.keys(CONCRETE_GRADES);          // C20 ... C80 顺序
  const i = order.indexOf(grade);
  const t = Math.max(0, (i - order.indexOf('C50')) /
                        (order.indexOf('C80') - order.indexOf('C50')));
  return {
    fc: g.fc,
    ft: g.ft,
    alpha1: 1.0 - 0.06 * t,       // 等效应力值系数
    beta1: 0.8 - 0.06 * t,        // 等效受压区高度系数
    epsCu: 0.0033 - 0.0003 * t,   // 混凝土极限压应变
  };
}