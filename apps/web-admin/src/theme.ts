import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  typography: {
    fontFamily: "\"Plus Jakarta Sans\", sans-serif",
    h3: { fontWeight: 800, letterSpacing: 0 },
    h4: { fontWeight: 700, letterSpacing: 0 },
    h5: { fontWeight: 700, letterSpacing: 0 }
  },
  palette: {
    mode: "light",
    primary: {
      main: "#0F766E",
      light: "#14B8A6",
      dark: "#115E59"
    },
    secondary: {
      main: "#EA580C",
      light: "#FB923C",
      dark: "#C2410C"
    },
    background: {
      default: "#F6F9F8",
      paper: "#FFFFFF"
    },
    text: {
      primary: "#1F2937",
      secondary: "#4B5563"
    }
  },
  shape: {
    borderRadius: 14
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(15, 118, 110, 0.08)",
          boxShadow: "0 10px 30px rgba(15, 118, 110, 0.08)"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999
        }
      }
    }
  }
});
