export interface AreaRoom {
  id: string;
  name: string;
  lengthM: number;
  widthM: number;
}

export function areaRoomAreaM2(room: AreaRoom): number {
  return room.lengthM * room.widthM;
}

export function totalAreaM2(rooms: AreaRoom[]): number {
  return rooms.reduce((sum, room) => sum + areaRoomAreaM2(room), 0);
}
