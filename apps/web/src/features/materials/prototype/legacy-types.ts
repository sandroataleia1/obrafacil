/**
 * SUPPLY-FRONTEND-01B — the OLD prototype `MaterialRequirement` shape
 * (camelCase, `requiredQuantity: number`, localStorage-backed), moved out
 * of `../types.ts` so that file can become the real
 * `/api/v1/projects/{project}/material-requirements` contract.
 *
 * `material-requirement-store.ts` still reads/writes this shape — it
 * remains the localStorage-backed data source for modules OUTSIDE the
 * migrated Requirement screens that this gate is explicitly forbidden
 * from touching: the Dashboard executive panel
 * (`features/dashboard/prototype/use-executive-panel.ts`), the Obra
 * detail widget (`features/projects/project-detail.tsx`), the Analytics
 * layer (`features/analytics/*`), and Stock's `supply-metrics.ts`
 * projection. Mirrors the exact same transitional pattern already used
 * for `Budget` in `features/budgets/prototype/legacy-types.ts`. No
 * migrated Requirement screen (`requirement-form.tsx`,
 * `project-requirement-list.tsx`) may import this file.
 */
export interface LegacyMaterialRequirement {
  id: string;

  projectId: string;
  materialId: string;

  requiredQuantity: number;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}
