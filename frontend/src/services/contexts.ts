/**
 * Health Contexts API calls.
 * Maps to /api/v1/contexts/* endpoints.
 */
import { api } from "./api";
import type { HealthContext, PregnancyContext } from "@/types/context";
import type { FocusRef, RankedFocus } from "@/lib/careFocus";

interface BackendContext {
  id: string;
  kind: string;
  condition_id: string;
  condition_ids: string[];
  key: string;
  pregnancy_data: PregnancyContext | null;
  created_at: string;
  updated_at: string;
}

function toContext(b: BackendContext): HealthContext {
  return {
    id: b.id,
    kind: b.kind as HealthContext["kind"],
    conditionId: b.condition_id || undefined,
    conditionIds: b.condition_ids.length > 0 ? b.condition_ids : undefined,
    key: (b.key as HealthContext["key"]) || undefined,
    pregnancy: b.pregnancy_data ?? undefined,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

interface PaginatedResponse<T> {
  count: number;
  results: T[];
  next: string | null;
}

export async function fetchContexts(): Promise<HealthContext[]> {
  const res = await api.get<PaginatedResponse<BackendContext>>("/v1/contexts/", {
    params: { page_size: 100 },
  });
  return res.data.results.map(toContext);
}

export async function createContext(ctx: Partial<HealthContext>): Promise<HealthContext> {
  const res = await api.post<BackendContext>("/v1/contexts/", {
    kind: ctx.kind,
    condition_id: ctx.conditionId ?? "",
    condition_ids: ctx.conditionIds ?? [],
    key: ctx.key ?? "",
    pregnancy_data: ctx.pregnancy ?? null,
  });
  return toContext(res.data);
}

export async function updateContext(id: string, ctx: Partial<HealthContext>): Promise<HealthContext> {
  const payload: Record<string, unknown> = {};
  if (ctx.kind !== undefined)         payload.kind = ctx.kind;
  if (ctx.conditionId !== undefined)  payload.condition_id = ctx.conditionId ?? "";
  if (ctx.conditionIds !== undefined) payload.condition_ids = ctx.conditionIds ?? [];
  if (ctx.key !== undefined)          payload.key = ctx.key ?? "";
  if (ctx.pregnancy !== undefined)    payload.pregnancy_data = ctx.pregnancy ?? null;
  const res = await api.patch<BackendContext>(`/v1/contexts/${id}/`, payload);
  return toContext(res.data);
}

export async function deleteContext(id: string): Promise<void> {
  await api.delete(`/v1/contexts/${id}/`);
}

/* -------------------------------------------------------------- care focus -- */


/** GET /v1/contexts/focus/: the stored focus references and the server's ranking. */
export async function fetchCareFocus(): Promise<{ focus: FocusRef[]; ranked: RankedFocus[] }> {
  const res = await api.get<{ focus: FocusRef[]; ranked: RankedFocus[] }>("/v1/contexts/focus/");
  return res.data;
}

/** PUT /v1/contexts/focus/: replace the focus list; the server validates and re-ranks it. */
export async function saveCareFocus(focus: FocusRef[]): Promise<{ focus: FocusRef[]; ranked: RankedFocus[] }> {
  const res = await api.put<{ focus: FocusRef[]; ranked: RankedFocus[] }>("/v1/contexts/focus/", { focus });
  return res.data;
}
