import React from 'react';
import {
  Paper, Typography, Grid, TextField, MenuItem, InputAdornment,
  Divider, Chip, Stack, Alert, Box,
} from '@mui/material';
import { CONCRETE_GRADES, STEEL_GRADES } from '../utils/materials';

function NumField({ label, value, onChange, unit, step = 1 }) {
  return (
    <TextField
      fullWidth size="small" type="number"
      label={label} value={value}
      onChange={e => onChange(e.target.value)}
      inputProps={{ step }}
      InputProps={{ endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }}
    />
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <TextField fullWidth size="small" select label={label} value={value}
      onChange={e => onChange(e.target.value)}>
      {options.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>
  );
}

const BAR_DIAS  = [12, 14, 16, 18, 20, 22, 25, 28, 32];
const STIR_DIAS = [6, 8, 10, 12];
const LEGS = [
  { value: 2, label: '2 肢' },
  { value: 4, label: '4 肢' },
  { value: 6, label: '6 肢' },
  { value: 8, label: '8 肢' },
];

export default function ColumnInputs({ params, setParam, summary, warnings }) {
  const concreteOptions = Object.keys(CONCRETE_GRADES).map(g => ({ value: g, label: g }));
  const steelOptions    = Object.keys(STEEL_GRADES).map(g => ({ value: g, label: g }));

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>设计参数</Typography>

      <Grid container spacing={1.5}>
        {/* ---- 截面与材料 ---- */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary">— 截面与材料 —</Typography>
        </Grid>
        <Grid item xs={6}>
          <NumField label="宽度 b" value={params.b} unit="mm" onChange={v => setParam('b', v)} />
        </Grid>
        <Grid item xs={6}>
          <NumField label="高度 h" value={params.h} unit="mm" onChange={v => setParam('h', v)} />
        </Grid>
        <Grid item xs={6}>
          <NumField label="保护层 c" value={params.cover} unit="mm" onChange={v => setParam('cover', v)} />
        </Grid>
        <Grid item xs={6}>
          <SelectField label="混凝土强度" value={params.concreteGrade}
            options={concreteOptions} onChange={v => setParam('concreteGrade', v)} />
        </Grid>
        {/* ★ 纵筋与箍筋强度分开 */}
        <Grid item xs={6}>
          <SelectField label="纵筋强度" value={params.steelGradeLong}
            options={steelOptions} onChange={v => setParam('steelGradeLong', v)} />
        </Grid>
        <Grid item xs={6}>
          <SelectField label="箍筋强度" value={params.steelGradeStirrup}
            options={steelOptions} onChange={v => setParam('steelGradeStirrup', v)} />
        </Grid>

        {/* ---- 纵向钢筋 ---- */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary">— 纵向钢筋 —</Typography>
        </Grid>
        <Grid item xs={6}>
          <SelectField label="角筋直径" value={params.dCorner}
            options={BAR_DIAS.map(d => ({ value: d, label: `Φ${d}` }))}
            onChange={v => setParam('dCorner', Number(v))} />
        </Grid>
        {/* ★ X 向中部筋：布置在上、下边（沿 b 边） */}
        <Grid item xs={6}>
          <NumField label="X向中部筋根数/边" value={params.nSideX} unit="根"
            onChange={v => setParam('nSideX', v)} />
        </Grid>
        <Grid item xs={6}>
          <SelectField label="X向中部筋直径" value={params.dSideX}
            options={BAR_DIAS.map(d => ({ value: d, label: `Φ${d}` }))}
            onChange={v => setParam('dSideX', Number(v))} />
        </Grid>
        {/* ★ Y 向中部筋：布置在左、右边（沿 h 边） */}
        <Grid item xs={6}>
          <NumField label="Y向中部筋根数/边" value={params.nSideY} unit="根"
            onChange={v => setParam('nSideY', v)} />
        </Grid>
        <Grid item xs={6}>
          <SelectField label="Y向中部筋直径" value={params.dSideY}
            options={BAR_DIAS.map(d => ({ value: d, label: `Φ${d}` }))}
            onChange={v => setParam('dSideY', Number(v))} />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="caption" color="text.secondary">
            X向中部筋布置于上、下边（沿 b 边）；Y向中部筋布置于左、右边（沿 h 边）
          </Typography>
        </Grid>

        {/* ---- 箍筋 ---- */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="text.secondary">— 箍筋 —</Typography>
        </Grid>
        {/* ★ 肢数按 X / Y 两个方向分别设置 */}
        <Grid item xs={6}>
          <SelectField label="X向肢数（竖向肢）" value={params.legsX} options={LEGS}
            onChange={v => setParam('legsX', Number(v))} />
        </Grid>
        <Grid item xs={6}>
          <SelectField label="Y向肢数（横向肢）" value={params.legsY} options={LEGS}
            onChange={v => setParam('legsY', Number(v))} />
        </Grid>
        <Grid item xs={6}>
          <SelectField label="箍筋直径" value={params.dStirrup}
            options={STIR_DIAS.map(d => ({ value: d, label: `Φ${d}` }))}
            onChange={v => setParam('dStirrup', Number(v))} />
        </Grid>
        <Grid item xs={6}>
          <NumField label="箍筋间距" value={params.sStirrup} unit="mm"
            onChange={v => setParam('sStirrup', v)} />
        </Grid>
      </Grid>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="subtitle2" gutterBottom>截面摘要</Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Chip size="small" label={`纵筋 ${summary.nBars} 根`} />
        <Chip size="small" label={`As = ${summary.As} mm²`} />
        <Chip size="small" color={summary.rhoNum > 5 ? 'error' : 'primary'}
          label={`ρ = ${summary.rho}%`} />
      </Stack>

      <Box sx={{ mt: 0.5 }}>
        {warnings.map((w, i) => (
          <Alert key={i} severity="warning" sx={{ mt: 1, py: 0 }}>{w}</Alert>
        ))}
      </Box>
    </Paper>
  );
}