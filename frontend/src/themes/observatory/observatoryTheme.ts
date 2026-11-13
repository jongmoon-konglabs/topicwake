import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { palette } from "./palette.generated";

// Quiet blue identifies selection; green/red remain exclusive to receive state.
export const observatoryTheme = defineTheme({
  name: "observatory",
  extends: neutralTheme,
  tokens: {
    "--font-family-body":
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif',
    "--font-family-heading":
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif',
    "--color-background-body": ["#f3f5f8", "#171c24"],
    "--color-background-muted": ["#edf1f5", "#212936"],
    "--color-background-surface": ["#ffffff", "#222a35"],
    "--color-background-card": ["#ffffff", "#222a35"],
    "--color-border": ["#dce2e9", "#3d4756"],
    "--color-text-primary": ["#1d2939", "#edf2f8"],
    "--color-text-secondary": ["#526174", "#bac5d4"],
    "--color-accent": [palette.blue.light[30], palette.blue.dark[70]],
    "--color-text-accent": [palette.blue.light[25], palette.blue.dark[80]],
    "--color-icon-accent": [palette.blue.light[30], palette.blue.dark[70]],
    "--color-on-accent": ["#ffffff", "#14263b"],
    "--text-heading-2-size": "1.0625rem",
    "--text-heading-2-leading": "1.4",
    "--radius-container": "0.625rem",
    "--radius-element": "0.375rem",
  },
  components: {
    item: {
      selected: {
        backgroundColor: "light-dark(#eaf2fc, #263e5a)",
        boxShadow: "inset 3px 0 0 var(--color-accent)",
        color: "var(--color-text-primary)",
        "--color-text-secondary": "light-dark(#435a75, #c4d6ec)",
      },
    },
  },
});
