import { createTheme, DEFAULT_THEME } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily: `"IBM Plex Sans", ${DEFAULT_THEME.fontFamily}`,
  fontFamilyMonospace: `"IBM Plex Mono", ${DEFAULT_THEME.fontFamilyMonospace}`,
  headings: {
    fontFamily: `"IBM Plex Sans", ${DEFAULT_THEME.fontFamily}`,
    fontWeight: "600",
  },
  respectReducedMotion: true,
});
