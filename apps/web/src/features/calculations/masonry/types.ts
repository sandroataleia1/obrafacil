export type MasonryStep =
  | "material"
  | "dimensions"
  | "openings"
  | "waste"
  | "result";

export const MASONRY_STEPS: MasonryStep[] = [
  "material",
  "dimensions",
  "openings",
  "waste",
];

export type OpeningKind = "door" | "window";

export interface OpeningItem {
  id: string;
  widthM: number;
  heightM: number;
  quantity: number;
}
