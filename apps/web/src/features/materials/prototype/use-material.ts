"use client";

import { useEffect, useState } from "react";

import { getMaterial } from "./material-store";
import type { Material } from "../types";

export function useMaterial(id: string) {
  const [material, setMaterial] = useState<Material | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaterial(getMaterial(id));
  }, [id]);

  function refresh() {
    setMaterial(getMaterial(id));
  }

  return { material, refresh };
}
