export interface CeilingRoom {
  id: string;
  name: string;
  lengthM: number;
  widthM: number;
  /** Panel length chosen for this room, in meters — picked per room in
   * step 2, since different rooms can use different panel lengths. */
  panelLengthM: number | null;
}

export function ceilingRoomAreaM2(room: CeilingRoom): number {
  return room.lengthM * room.widthM;
}

export function ceilingRoomPerimeterM(room: CeilingRoom): number {
  return 2 * (room.lengthM + room.widthM);
}
