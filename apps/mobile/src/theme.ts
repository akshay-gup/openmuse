/**
 * Design tokens: the one place that knows a hex value, a font size or a corner radius.
 *
 * Everything else in the app asks for a role ("colors.primary", "fontSize.ui", "radius.lg")
 * rather than a value, so a style guide is applied by editing this file. A test
 * (test/theme.test.ts) fails if a raw colour appears anywhere else, and checks that the
 * text/background pairs below keep a readable contrast (WCAG AA).
 *
 * The look is Graphite: dark glass. Panels are faint white over a near-black backdrop with a soft
 * teal glow, with a bright rim along the top edge, a hairline, and a deep drop shadow. The web blurs
 * what is behind a panel or a sheet; native has no blur here, so its fills are a little more
 * opaque. Hairlines and quiet fills are tints of white, so they sit equally well on the backdrop, on
 * a panel and on a card. Teal marks what is active or primary, and nothing else is coloured unless
 * it carries a status.
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
  canvas: "#0B0F13",
  /** Cards, inputs and anything raised off a panel: a faint white over whatever it sits on. */
  surface: "rgba(255,255,255,0.065)",
  /** The page behind a web page or a document shown in a frame, which assume a white page. */
  paper: "#FFFFFF",
  /** Quiet fills: secondary buttons, chips, code. */
  surfaceMuted: "rgba(255,255,255,0.06)",
  /** Hover and pressed state on quiet fills and rows. */
  surfaceHover: "rgba(255,255,255,0.10)",

  // Lines
  /** Hairlines and default borders. */
  line: "rgba(255,255,255,0.09)",
  /** Borders that must be seen: inputs, hovered cards. */
  lineStrong: "rgba(255,255,255,0.20)",

  // Text
  /** Body and heading ink. */
  text: "#E8EDF2",
  /** Secondary text. */
  muted: "#A3B1BE",
  /** Icons and decoration only. Too dim for text. */
  subtle: "#6F7E8D",
  /** Text and icons on `primary` and other solid fills. */
  onPrimary: "#06222B",

  // Brand
  /** Main actions, active states, focus: fills, borders and icons. Dark text on it is AA. */
  primary: "#4DB0C8",
  /** `primary` while pressed or hovered. */
  primaryPressed: "#7CCBDD",
  /** Links and other teal text. */
  primaryText: "#7CCBDD",
  /** Tint behind selected rows, info cards, icon tiles. */
  primarySoft: "rgba(77,176,200,0.16)",
  /** `primarySoft` while hovered or pressed. */
  primarySoftStrong: "rgba(77,176,200,0.26)",
  /** Keyboard focus ring. */
  focusRing: "rgba(77,176,200,0.40)",
  /** Fill of a selected card or option. Opaque: the gradient border is drawn behind it. */
  selected: "#1A3138",
  /** Border of a selected card or option (the gradient border replaces it on web). */
  selectedLine: "#4DB0C8",
  /** Amber: the "new" accent. Dashed create tiles, never body text. */
  accent: palette.amber,
  /** Tint behind amber elements. */
  accentSoft: "rgba(251,191,36,0.14)",
  /** Text and icons on amber tints. */
  accentText: "#F6CF72",

  // Status
  danger: "#FF9AA2",
  dangerBg: "rgba(255,107,120,0.12)",
  dangerLine: "rgba(255,107,120,0.28)",
  warning: "#F0A15A",
  warningText: "#F6C58B",
  warningBg: "rgba(217,122,43,0.18)",
  warningLine: "rgba(217,122,43,0.34)",
  success: "#3DD68C",
  successText: "#7EE9B8",
  successBg: "rgba(28,204,128,0.14)",
  /** Queued, paused, scheduled. */
  neutral: "#8795A2",

  // Overlays
  /** Behind sheets and drawers. */
  scrim: "rgba(0,0,0,0.55)",
  /** Light toast. */
  inverse: "#E8EDF2",
  onInverse: "#0B1620",
} as const;

export type Colors = typeof colors;

const hazeBase = "#0B0F13";
/**
 * The backdrop behind the glass: near-black with a soft teal glow at the top left and a cool grey
 * one at the bottom right, scaled to the screen. The web draws `css`; native keeps the flat `base`.
 * `lightest` is the brightest tone the haze reaches, and text on glass is checked against it
 * (test/theme.test.ts).
 */
export const haze = {
  base: hazeBase,
  lightest: "#143440",
  css: `radial-gradient(70% 90% at 0% 0%, rgba(42,138,163,0.22), rgba(42,138,163,0) 70%), radial-gradient(75% 85% at 100% 100%, rgba(94,115,136,0.16), rgba(94,115,136,0) 70%), ${hazeBase}`,
} as const;

/**
 * Glass fills. The web lays them over a blur of what is behind (`blur`); native has no blur here,
 * so its `*Solid` fills are a little more opaque.
 */
export const glass = {
  /** A panel: the sidebar, a channel, a thread. */
  panel: "rgba(255,255,255,0.055)",
  /** A bar: the phone's header. */
  bar: "rgba(255,255,255,0.08)",
  /** Raised off a panel: the composer and the phone's tab bar. */
  raised: "rgba(30,40,50,0.92)",
  /** A sheet over the dimmed page. */
  sheet: "rgba(20,28,36,0.94)",
  panelSolid: "rgba(255,255,255,0.07)",
  barSolid: "rgba(255,255,255,0.10)",
  raisedSolid: "rgba(30,40,50,0.97)",
  sheetSolid: "rgba(20,28,36,0.98)",
  /** The blur behind a panel or a sheet (web). */
  blur: "blur(30px) saturate(130%)",
} as const;

/** Text roles drawn straight onto glass. The test checks each against a fill over the lightest haze. */
export const glassTextRoles = ["text", "muted", "primaryText", "danger"] as const;

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
  "rgba(94,150,230,0.20)",
  "rgba(145,228,231,0.16)",
] as const;

/** Background discs behind the capybara, one per avatar the person can choose. */
export const mascotTints = {
  sky: "rgba(110,170,215,0.28)",
  sand: "rgba(235,195,125,0.28)",
  lilac: "rgba(170,150,235,0.28)",
} as const;

/** Bars on the task timeline. */
export const chart = {
  agent: colors.primary,
  manual: "#6E8CA8",
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
export const radius = { sm: 6, md: 10, lg: 12, xl: 20, xxl: 25, panel: 22, pill: 999 } as const;

/** Spacing scale: multiples of 4. */
export const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Elevation, as CSS box-shadow strings (supported by React Native 0.76+ and the web). */
export const shadow = {
  /** Cards at rest: a bright top edge and a soft drop. */
  card: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.25)",
  /** Cards under the pointer. */
  raised: "0 4px 16px rgba(0,0,0,0.45)",
  /** Menus and floating panels. */
  popover: "0 10px 30px rgba(0,0,0,0.5)",
  /** A glass panel: a bright rim along its top edge, a hairline, and a deep drop. */
  panel:
    "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(255,255,255,0.07), 0 24px 60px rgba(0,0,0,0.45)",
  /** The selected row in a list on glass: a faint lens with a hairline. */
  lens: "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.09)",
  /** The row you are on in the sidebar: a teal ring. */
  active: "inset 0 0 0 1px rgba(77,176,200,0.28)",
  /** Raised off a panel: the composer and the phone's tab bar. */
  float:
    "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(255,255,255,0.10), 0 14px 34px rgba(0,0,0,0.4)",
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

/**
 * Shared chrome sizes, so the sidebar header and the main header always line up. `gap` is the room
 * between panels and the margin round them.
 */
export const layout = { headerHeight: 56, gap: 12 } as const;
