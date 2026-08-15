import { createTheme } from '@mui/material/styles';

// 全局 MUI 主题：主色蓝（纵筋/界面），辅色橙（箍筋/控制点）
const theme = createTheme({
  palette: {
    primary: { main: '#1565c0' },
    secondary: { main: '#ef6c00' },
  },
  typography: {
    fontFamily: '"Roboto","Helvetica","Arial","Microsoft YaHei",sans-serif',
  },
});

export default theme;