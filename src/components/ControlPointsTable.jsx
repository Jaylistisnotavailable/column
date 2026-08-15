import React from 'react';
import {
  Paper, Typography, Table, TableHead, TableBody,
  TableRow, TableCell, TableContainer,
} from '@mui/material';

/** 控制点数据表：名称 / N / Mx / My / 说明 */
export default function ControlPointsTable({ controlPoints }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>控制点数据</Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>控制点</TableCell>
              <TableCell align="right">N (kN)</TableCell>
              <TableCell align="right">Mx (kN·m)</TableCell>
              <TableCell align="right">My (kN·m)</TableCell>
              <TableCell>说明</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {controlPoints.map((p, i) => (
              <TableRow key={i} hover>
                <TableCell>{p.name}</TableCell>
                <TableCell align="right">{p.N.toFixed(1)}</TableCell>
                <TableCell align="right">{p.Mx.toFixed(1)}</TableCell>
                <TableCell align="right">{p.My.toFixed(1)}</TableCell>
                <TableCell>{p.desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}