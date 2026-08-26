export interface MasonryMaterial {
  id: string;
  name: string;
  dimensions: string;
  /** Units needed per m² of wall, already accounting for a ~1cm mortar joint. */
  unitsPerSquareMeter: number;
  /** Label used for the result hero (e.g. "Tijolos", "Blocos"). */
  resultLabel: string;
}

export const masonryMaterials: MasonryMaterial[] = [
  {
    id: "tijolo-9x14x29",
    name: "Tijolo cerâmico",
    dimensions: "9 × 14 × 29 cm",
    unitsPerSquareMeter: 33.33,
    resultLabel: "Tijolos",
  },
  {
    id: "bloco-14x19x39",
    name: "Bloco de concreto",
    dimensions: "14 × 19 × 39 cm",
    unitsPerSquareMeter: 12.5,
    resultLabel: "Blocos",
  },
  {
    id: "tijolo-9x19x29",
    name: "Tijolo cerâmico",
    dimensions: "9 × 19 × 29 cm",
    unitsPerSquareMeter: 16.67,
    resultLabel: "Tijolos",
  },
];
