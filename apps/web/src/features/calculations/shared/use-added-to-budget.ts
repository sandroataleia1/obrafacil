import { useEffect, useState } from "react";

/**
 * FRONTEND-BUDGETS-01A1 §16-18: the "Resultado adicionado ao orçamento"
 * visual state is tied to a handoff that belongs to ONE specific Company.
 * If the user switches Company without leaving the calculator screen, that
 * flag must not keep claiming the result was added — the handoff it refers
 * to belongs to the company that has just been left. This resets the flag
 * to `false` the moment `activeCompanyId` changes (including to/from
 * `undefined`), while leaving the on-screen technical calculation itself
 * untouched, so the new Company can consciously generate its OWN handoff
 * by clicking "Adicionar ao orçamento" again — never silently inheriting
 * Company A's handoff.
 */
export function useAddedToBudget(activeCompanyId: string | undefined) {
  const [addedToBudget, setAddedToBudget] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddedToBudget(false);
  }, [activeCompanyId]);

  return [addedToBudget, setAddedToBudget] as const;
}
