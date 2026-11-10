/**
 * Where a single record opens. One place, so the timeline, the search box and
 * anything else that lists records all land on the same detail page.
 */
export type LinkableRecord =
  | "allergies"
  | "medications"
  | "conditions"
  | "appointments"
  | "documents"
  | "measurements"
  | "immunizations"
  | "procedures";

export function recordPath(type: LinkableRecord, id: string): string {
  switch (type) {
    // No detail page of their own yet: they live on the medical summary.
    case "immunizations":
    case "procedures":
      return "/app/summary";
    default:
      return `/app/records/${type}/${encodeURIComponent(id)}`;
  }
}
