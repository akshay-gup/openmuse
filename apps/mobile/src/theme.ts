/**
 * Design tokens: the one place that knows a hex value, a font size or a corner radius.
 *
 * Everything else in the app asks for a role ("colors.primary", "fontSize.ui", "radius.lg")
 * rather than a value, so a style guide is applied by editing this file. A test
 * (test/theme.test.ts) fails if a raw colour appears anywhere else, and checks that the
 * text/background pairs below keep a readable contrast (WCAG AA).
 *
 * Dark mode: add a second object with the same keys as `colors` and choose between them
 * from a context. No component needs to change.
 */

/** Semantic colours. Pick by role, never by hue. */
export const colors = {
  // Surfaces
  /** App and page background. */
  canvas: "#FFFFFF",
  /** Cards, sheets, inputs and anything raised above the canvas. */
  surface: "#FFFFFF",
  /** Quiet fills: sidebar, secondary buttons, chips, code. */
  surfaceMuted: "#F4F6F7",
  /** Hover and pressed state on quiet fills and rows. */
  surfaceHover: "#E9EDEF",

  // Lines
  /** Hairlines and default borders. */
  line: "#E3E7EA",
  /** Borders that must be seen: inputs, hovered cards. */
  lineStrong: "#B8C0C5",

  // Text
  text: "#11191C",
  /** Secondary text. */
  muted: "#697176",
  /** Icons and decoration only. Too light for text. */
  subtle: "#8B959B",
  /** Text and icons on `primary` and other solid fills. */
  onPrimary: "#FFFFFF",

  // Brand
  /** Main actions, links, active states, focus. White text on it is AA. */
  primary: "#26778C",
  /** `primary` while pressed or hovered. */
  primaryPressed: "#1F6578",
  /** Tint behind selected rows, info cards, icon tiles. */
  primarySoft: "#E8F3F6",
  /** `primarySoft` while hovered or pressed. */
  primarySoftStrong: "#D3E8EE",
  /** Keyboard focus ring. */
  focusRing: "rgba(38,119,140,0.28)",

  // Status
  danger: "#A12B32",
  dangerBg: "#FCECED",
  dangerLine: "#F0D5D3",
  warning: "#D97A2B",
  warningText: "#995414",
  warningBg: "#FFF3E3",
  warningLine: "#EBDDB5",
  success: "#2E9E5B",
  successText: "#23705C",
  successBg: "#EAF6F0",
  /** Queued, paused, scheduled. */
  neutral: "#9AA3A8",

  // Overlays
  /** Behind sheets and drawers. */
  scrim: "rgba(17,25,28,0.32)",
  /** Dark toast. */
  inverse: "#11191C",
  onInverse: "#FFFFFF",
} as const;

export type Colors = typeof colors;

/** Pairs that carry text. test/theme.test.ts checks each against WCAG AA (4.5:1). */
export const textPairs: readonly (readonly [keyof Colors, keyof Colors])[] = [
  ["text", "canvas"],
  ["text", "surfaceMuted"],
  ["text", "primarySoft"],
  ["muted", "canvas"],
  ["muted", "surfaceMuted"],
  ["onPrimary", "primary"],
  ["onPrimary", "primaryPressed"],
  ["primary", "canvas"],
  ["primary", "primarySoft"],
  ["danger", "canvas"],
  ["danger", "dangerBg"],
  ["warningText", "warningBg"],
  ["successText", "successBg"],
  ["onInverse", "inverse"],
];

/** Tints for people's initials, so a busy channel is easier to scan. */
export const avatarTints = [
  colors.primarySoft,
  colors.successBg,
  colors.warningBg,
  "#F0EEFA",
  "#F6EAF4",
] as const;

/** Background discs behind the capybara, one per avatar the person can choose. */
export const mascotTints = { sky: "#ECF5FA", sand: "#FAF0DF", lilac: "#F1ECF9" } as const;

/** Bars on the task timeline. */
export const chart = { agent: colors.primary, manual: "#8E8BD8", done: "#7FB98A" } as const;

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
export const eventColors = ["#8FC1CE", "#A7CDB0", "#C3B8E6"] as const;

/** The dark finance summary card is its own piece of art, not part of the app chrome. */
export const financeArt = {
  card: "#080B10",
  panel: "#1D2025",
  gradient: ["#281066", "#163BBF", "#148CE8"],
  intro: "#D4DCFC",
  label: "#A4A7AD",
  note: "#7E8289",
  positive: "#58D3AE",
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
  display: { fontSize: fontSize.display, lineHeight: 34, fontWeight: "600", letterSpacing: -0.5 },
  title: { fontSize: fontSize.title, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3 },
  heading: { fontSize: fontSize.heading, lineHeight: 22, fontWeight: "600", letterSpacing: -0.2 },
  body: { fontSize: fontSize.body, lineHeight: 22 },
  ui: { fontSize: fontSize.ui, lineHeight: 20 },
  small: { fontSize: fontSize.small, lineHeight: 18 },
  caption: { fontSize: fontSize.caption, lineHeight: 17 },
  micro: { fontSize: fontSize.micro, lineHeight: 15 },
  label: {
    fontSize: fontSize.micro,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
} as const;

/** Corner radii. Circles use half their size and are not in this scale. */
export const radius = { sm: 6, md: 10, lg: 12, xl: 16, pill: 999 } as const;

/** Spacing scale: multiples of 4. */
export const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** Elevation, as CSS box-shadow strings (supported by React Native 0.76+ and the web). */
export const shadow = {
  /** Cards at rest. */
  card: "0 1px 4px rgba(17,25,28,0.05)",
  /** Cards under the pointer. */
  raised: "0 4px 16px rgba(17,25,28,0.12)",
  /** Menus and floating panels. */
  popover: "0 10px 30px rgba(17,25,28,0.14)",
  /** Focus ring drawn around inputs. */
  focus: `0 0 0 3px ${colors.focusRing}`,
} as const;

/** Font families. `web` is the stack react-native-web gives Text; raw web <input> elements need it spelled out. */
export const fontFamily = {
  web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  monoIos: "Menlo",
  monoAndroid: "monospace",
} as const;

/** Shared chrome sizes, so the sidebar header and the main header always line up. */
export const layout = { headerHeight: 56 } as const;
