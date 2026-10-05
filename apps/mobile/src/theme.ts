/**
 * Design tokens: the one place that knows a hex value, a font size or a corner radius.
 *
 * Everything else in the app asks for a role ("colors.primary", "fontSize.ui", "radius.lg")
 * rather than a value, so a style guide is applied by editing this file. A test
 * (test/theme.test.ts) fails if a raw colour appears anywhere else, and checks that the
 * text/background pairs below keep a readable contrast (WCAG AA).
 *
 * The values follow the web app's stylesheet (Poppins, the navy / teal / amber brand colours,
 * hairline cards with a hover lift). Dark mode: add a second object with the same keys as
 * `colors` and choose between them from a context. No component needs to change.
 */

/**
 * The brand swatches. Decorative use only (fills, charts, art): text and icons take their colour
 * from the roles in `colors`, which are checked for contrast.
 */
export const palette = {
  navy: "#031D44",
  mediumBlue: "#1C4768",
  brightBlue: "#22B1E0",
  tealGreen: "#1CCC80",
  lightCyan: "#91E4E7",
  lightGray: "#EEF2F5",
  amber: "#FBBF24",
} as const;

/** Semantic colours. Pick by role, never by hue. */
export const colors = {
  // Surfaces
  /** App and page background. */
  canvas: "#FFFFFF",
  /** Cards, sheets, inputs and anything raised above the canvas. */
  surface: "#FFFFFF",
  /** Quiet fills: sidebar, secondary buttons, chips, code. */
  surfaceMuted: palette.lightGray,
  /** Hover and pressed state on quiet fills and rows. */
  surfaceHover: "#E2E9EE",

  // Lines
  /** Hairlines and default borders. */
  line: "#E0E0E0",
  /** Borders that must be seen: inputs, hovered cards. */
  lineStrong: "#BDBDBD",

  // Text
  /** Body and heading ink: the brand navy. */
  text: palette.navy,
  /** Secondary text. */
  muted: "#5D6870",
  /** Icons and decoration only. Too light for text. */
  subtle: "#8B959B",
  /** Text and icons on `primary` and other solid fills. */
  onPrimary: "#FFFFFF",

  // Brand
  /** Main actions, active states, focus: fills, borders and icons. White text on it is AA. */
  primary: "#298097",
  /** `primary` while pressed or hovered. */
  primaryPressed: "#216F83",
  /** Links and other teal text. A shade darker than `primary`, so it stays AA on the tints. */
  primaryText: "#1F6E83",
  /** Tint behind selected rows, info cards, icon tiles. */
  primarySoft: "#E9F5F7",
  /** `primarySoft` while hovered or pressed. */
  primarySoftStrong: "#D3E9EE",
  /** Keyboard focus ring. */
  focusRing: "rgba(41,128,151,0.28)",
  /** Fill of a selected card or option. */
  selected: "#D9F7F7",
  /** Border of a selected card or option (the gradient border replaces it on web). */
  selectedLine: "#0093AB",
  /** Amber: the "new" accent. Dashed create tiles, never body text. */
  accent: palette.amber,
  /** Tint behind amber elements. */
  accentSoft: "#FFF8E1",
  /** Text and icons on amber tints: a dark amber that stays AA. */
  accentText: "#8A5A00",

  // Status
  danger: "#A12B32",
  dangerBg: "#FCECED",
  dangerLine: "#F0D5D3",
  warning: "#D97A2B",
  warningText: "#995414",
  warningBg: "#FFF3E3",
  warningLine: "#EBDDB5",
  success: "#1DA028",
  successText: "#23705C",
  successBg: "#EAF6F0",
  /** Queued, paused, scheduled. */
  neutral: "#9AA3A8",

  // Overlays
  /** Behind sheets and drawers. */
  scrim: "rgba(3,29,68,0.32)",
  /** Dark toast. */
  inverse: palette.navy,
  onInverse: "#FFFFFF",
} as const;

export type Colors = typeof colors;

/** Pairs that carry text. test/theme.test.ts checks each against WCAG AA (4.5:1). */
export const textPairs: readonly (readonly [keyof Colors, keyof Colors])[] = [
  ["text", "canvas"],
  ["text", "surfaceMuted"],
  ["text", "primarySoft"],
  ["text", "selected"],
  ["muted", "canvas"],
  ["muted", "surfaceMuted"],
  ["muted", "primarySoft"],
  ["onPrimary", "primary"],
  ["onPrimary", "primaryPressed"],
  ["primaryText", "canvas"],
  ["primaryText", "surfaceMuted"],
  ["primaryText", "primarySoft"],
  ["primaryText", "selected"],
  ["danger", "canvas"],
  ["danger", "dangerBg"],
  ["warningText", "warningBg"],
  ["successText", "successBg"],
  ["accentText", "canvas"],
  ["accentText", "accentSoft"],
  ["onInverse", "inverse"],
];

/** Tints for people's initials, so a busy channel is easier to scan. */
export const avatarTints = [
  colors.primarySoft,
  colors.successBg,
  colors.warningBg,
  "#E3F4FB",
  "#E4F7F8",
] as const;

/** Background discs behind the capybara, one per avatar the person can choose. */
export const mascotTints = { sky: "#ECF5FA", sand: "#FAF0DF", lilac: "#F1ECF9" } as const;

/** Bars on the task timeline. */
export const chart = {
  agent: colors.primary,
  manual: palette.mediumBlue,
  done: colors.success,
} as const;

/** Third-party brand marks. They stay as the owner draws them. */
export const brand = {
  gmail: "#EA5B4D",
  googleCalendar: "#4285F4",
  googleDrive: "#34A853",
  browser: "#1987CF",
  openbot: "#6866A6",
  /** The red PDF badge on shared files. */
  pdf: "#FC2359",
} as const;

/** Accent bars on calendar events, cycled by calendar. */
export const eventColors = [palette.lightCyan, "#8FE3BF", "#FDDC7A"] as const;

/** The dark finance summary card is its own piece of art, not part of the app chrome. */
export const financeArt = {
  card: "#021A3D",
  panel: "#0B2A57",
  gradient: [palette.navy, palette.mediumBlue, palette.brightBlue],
  intro: "#D6ECF7",
  label: "#9DB5D1",
  note: "#8BA4C2",
  positive: "#2FE5A0",
} as const;

/** CSS gradients, for the web (native falls back to the flat colour next to each one). */
export const gradients = {
  /** Border of the selected card: teal into green. */
  selected: `linear-gradient(90deg, #3E8DA1 37.5%, ${palette.tealGreen} 100%)`,
} as const;

/** Text sizes. Use these rather than numbers. */
export const fontSize = {
  micro: 11,
  caption: 12,
  small: 13,
  ui: 14,
  body: 15,
  heading: 16,
  title: 20,
  display: 28,
} as const;

/** Sizes with their line heights and weights, for spreading into a style. */
export const type = {
  display: { fontSize: fontSize.display, lineHeight: 36, fontWeight: "600", letterSpacing: -0.4 },
  title: { fontSize: fontSize.title, lineHeight: 28, fontWeight: "600", letterSpacing: -0.2 },
  heading: { fontSize: fontSize.heading, lineHeight: 24, fontWeight: "600", letterSpacing: -0.1 },
  body: { fontSize: fontSize.body, lineHeight: 23 },
  ui: { fontSize: fontSize.ui, lineHeight: 21 },
  small: { fontSize: fontSize.small, lineHeight: 19 },
  caption: { fontSize: fontSize.caption, lineHeight: 18 },
  micro: { fontSize: fontSize.micro, lineHeight: 16 },
  label: {
    fontSize: fontSize.micro,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
} as const;

/** Corner radii. Circles use half their size and are not in this scale. */
export const radius = { sm: 6, md: 10, lg: 12, xl: 20, xxl: 25, pill: 999 } as const;

/** Spacing scale: multiples of 4. */
export const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Elevation, as CSS box-shadow strings (supported by React Native 0.76+ and the web). */
export const shadow = {
  /** Cards at rest. */
  card: "0 1px 4px rgba(0,0,0,0.04)",
  /** Cards under the pointer. */
  raised: "0 4px 16px rgba(0,0,0,0.14)",
  /** Menus and floating panels. */
  popover: "0 10px 30px rgba(0,0,0,0.12)",
  /** Focus ring drawn around inputs. */
  focus: `0 0 0 3px ${colors.focusRing}`,
} as const;

/**
 * Font families. On web the app font is Poppins, self-hosted and registered in src/fonts.ts, which
 * also makes it the default for every Text. `web` is the stack for raw web <input> elements, which
 * that rule does not reach. Native keeps each platform's system font.
 */
export const fontFamily = {
  web: '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  monoIos: "Menlo",
  monoAndroid: "monospace",
} as const;

/** Shared chrome sizes, so the sidebar header and the main header always line up. */
export const layout = { headerHeight: 56 } as const;
