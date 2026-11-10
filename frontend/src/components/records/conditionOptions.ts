import { createContext } from "react";
import type { Condition } from "@/types/health";

/**
 * Overrides the conditions offered for linking. The care-provider window wraps
 * its forms in this so a provider links to the patient's conditions, never to
 * whatever account happens to be signed in on their own browser.
 */
export const ConditionOptionsContext = createContext<Condition[] | null>(null);
