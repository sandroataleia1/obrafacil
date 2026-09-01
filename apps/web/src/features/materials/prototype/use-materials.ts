"use client";

import { useEffect, useState } from "react";

import { listMaterials } from "./material-store";
import type { Material } from "../types";

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[] | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaterials(listMaterials());
  }, []);

  function refresh() {
    setMaterials(listMaterials());
  }

  return { materials, refresh };
}
