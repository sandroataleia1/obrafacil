/**
 * Prototype data for UI validation only. Product dimensions and
 * calculation rules must be validated against the official calculation
 * reference before backend implementation.
 */

export const CEILING_PANEL_LENGTHS_M = [3, 4, 6, 7];

// Forro PVC panels come in a single fixed width — not a user choice.
export const CEILING_PANEL_WIDTH_M = 0.2;

export const CEILING_RODAFORRO_LENGTH_M = 6;

// Fixação: parafusos e buchas por barra de rodaforro; arame é um total
// fixo para a casa, não varia por cômodo ou metragem.
export const CEILING_SCREWS_PER_RODAFORRO = 6;
export const CEILING_ANCHORS_PER_RODAFORRO = 6;
export const CEILING_WIRE_TOTAL = 1;
