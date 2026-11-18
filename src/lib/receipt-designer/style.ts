import type { ResolvedStyle, Style } from "./types";

// What every receipt starts from before the theme and blocks change anything.
export const BASE_STYLE: ResolvedStyle = {
  font: "A",
  sizeW: 1,
  sizeH: 1,
  fontFamily: "courier",
  fontSize: 9,
  bold: false,
  italic: false,
  underline: false,
  inverse: false,
  color: "#000000",
  background: null,
  lineHeight: 1.3,
  letterSpacing: 0,
};

const defined = <T extends object>(s: T | undefined): Partial<T> =>
  s ? (Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Partial<T>) : {};

// theme → block → line: each later layer wins for the fields it sets.
export const resolveStyle = (...layers: (Style | undefined)[]): ResolvedStyle =>
  layers.reduce<ResolvedStyle>((acc, layer) => ({ ...acc, ...defined(layer) }), BASE_STYLE);
