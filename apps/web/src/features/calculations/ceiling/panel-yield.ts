/**
 * Physical cutting model for Forro panels — replaces the old area-based
 * "panels = ceil(roomArea×(1+waste) / panelArea)" formula.
 *
 * A panel is a linear commercial bar (panelLengthM), cut into straight
 * runs (runLengthM) laid side by side across strips (coverageWidthM wide,
 * panelWidthM each). Quantity is derived from whole cuts per bar, never
 * from fractional area. See Demo-Ready 005C spec for the full derivation
 * and the canonical 3×3 m / 6 m bar / 10% margin reference case.
 */

import type { CeilingDirection, CeilingRoom } from "./types";

export interface CeilingRoomYield {
  roomId: string;
  roomName: string;
  direction: CeilingDirection;
  runLengthM: number;
  coverageWidthM: number;
  panelLengthM: number;
  panelWidthM: number;
  strips: number;
  cutsPerBar: number;
  physicalBars: number;
  safetyBars: number;
  purchaseBars: number;
  requiredLengthM: number;
  physicalPurchasedLengthM: number;
  finalPurchasedLengthM: number;
  geometricWasteLengthM: number;
  physicalUtilization: number;
  viability: "viable" | "requires-splice";
}

export interface PanelsByLength {
  panelLengthM: number;
  physicalBars: number;
  safetyBars: number;
  purchaseBars: number;
  finalPurchasedLengthM: number;
}

/** Exact equality — direction is a geometric fact, never derived from
 * formatted/rounded display values. */
export function isSquareRoom(room: Pick<CeilingRoom, "lengthM" | "widthM">): boolean {
  return room.lengthM === room.widthM;
}

export function directionDimensions(
  room: Pick<CeilingRoom, "lengthM" | "widthM">,
  direction: CeilingDirection
): { runLengthM: number; coverageWidthM: number } {
  return direction === "length"
    ? { runLengthM: room.lengthM, coverageWidthM: room.widthM }
    : { runLengthM: room.widthM, coverageWidthM: room.lengthM };
}

export function computeCeilingYield(
  room: Pick<CeilingRoom, "id" | "name" | "lengthM" | "widthM">,
  direction: CeilingDirection,
  panelLengthM: number,
  panelWidthM: number,
  wastePercentage: number
): CeilingRoomYield {
  const { runLengthM, coverageWidthM } = directionDimensions(room, direction);
  const strips = Math.ceil(coverageWidthM / panelWidthM);
  const cutsPerBar = Math.floor(panelLengthM / runLengthM);

  if (cutsPerBar < 1) {
    return {
      roomId: room.id,
      roomName: room.name,
      direction,
      runLengthM,
      coverageWidthM,
      panelLengthM,
      panelWidthM,
      strips,
      cutsPerBar: 0,
      physicalBars: 0,
      safetyBars: 0,
      purchaseBars: 0,
      requiredLengthM: strips * runLengthM,
      physicalPurchasedLengthM: 0,
      finalPurchasedLengthM: 0,
      geometricWasteLengthM: 0,
      physicalUtilization: 0,
      viability: "requires-splice",
    };
  }

  const physicalBars = Math.ceil(strips / cutsPerBar);
  const requiredLengthM = strips * runLengthM;
  const physicalPurchasedLengthM = physicalBars * panelLengthM;
  const geometricWasteLengthM = physicalPurchasedLengthM - requiredLengthM;
  const physicalUtilization = requiredLengthM / physicalPurchasedLengthM;

  const purchaseStrips = Math.ceil(strips * (1 + wastePercentage / 100));
  const purchaseBars = Math.ceil(purchaseStrips / cutsPerBar);
  const safetyBars = purchaseBars - physicalBars;
  const finalPurchasedLengthM = purchaseBars * panelLengthM;

  return {
    roomId: room.id,
    roomName: room.name,
    direction,
    runLengthM,
    coverageWidthM,
    panelLengthM,
    panelWidthM,
    strips,
    cutsPerBar,
    physicalBars,
    safetyBars,
    purchaseBars,
    requiredLengthM,
    physicalPurchasedLengthM,
    finalPurchasedLengthM,
    geometricWasteLengthM,
    physicalUtilization,
    viability: "viable",
  };
}

/**
 * Recommend a direction among the viable alternatives for a fixed
 * panelLengthM: (1) fewest physicalBars, (2) tie → least geometric waste,
 * (3) tie → directions considered equivalent (first one returned).
 * totalPurchasedLengthM is intentionally not used as a tiebreaker — for a
 * fixed panelLengthM it is fully determined by physicalBars and therefore
 * redundant with criterion 1 (see 005C spec).
 */
export function recommendDirection(
  lengthYield: CeilingRoomYield,
  widthYield: CeilingRoomYield
): CeilingDirection | null {
  const lengthViable = lengthYield.viability === "viable";
  const widthViable = widthYield.viability === "viable";

  if (!lengthViable && !widthViable) return null;
  if (lengthViable && !widthViable) return "length";
  if (!lengthViable && widthViable) return "width";

  if (lengthYield.physicalBars !== widthYield.physicalBars) {
    return lengthYield.physicalBars < widthYield.physicalBars ? "length" : "width";
  }
  if (lengthYield.geometricWasteLengthM !== widthYield.geometricWasteLengthM) {
    return lengthYield.geometricWasteLengthM < widthYield.geometricWasteLengthM
      ? "length"
      : "width";
  }
  return "length";
}

export function groupPurchaseByPanelLength(yields: CeilingRoomYield[]): PanelsByLength[] {
  const groups = new Map<number, PanelsByLength>();
  for (const item of yields) {
    if (item.viability !== "viable") continue;
    const existing = groups.get(item.panelLengthM);
    if (existing) {
      existing.physicalBars += item.physicalBars;
      existing.safetyBars += item.safetyBars;
      existing.purchaseBars += item.purchaseBars;
      existing.finalPurchasedLengthM += item.finalPurchasedLengthM;
    } else {
      groups.set(item.panelLengthM, {
        panelLengthM: item.panelLengthM,
        physicalBars: item.physicalBars,
        safetyBars: item.safetyBars,
        purchaseBars: item.purchaseBars,
        finalPurchasedLengthM: item.finalPurchasedLengthM,
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.panelLengthM - b.panelLengthM);
}
