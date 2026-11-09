/**
 * Which record the signed-in user is currently acting on.
 *
 * A care proxy steps into another person's record from the Care proxy page.
 * Every API call made while they are there must name that owner, because the
 * backend otherwise scopes every endpoint to the session user. This module is
 * the one place that remembers the choice: the proxy store keeps it in sync,
 * and the axios interceptor stamps it on requests. It is deliberately outside
 * React so plain service modules inherit it without extra plumbing.
 */

let actAsUserId: string | null = null;

/** Set the owner whose record requests should act on. Null means "my own". */
export function setActAsUser(ownerId: string | null): void {
  actAsUserId = ownerId && ownerId.trim() ? ownerId : null;
}

/** The owner id to send as X-Act-As-User, or null when reading your own record. */
export function getActAsUser(): string | null {
  return actAsUserId;
}
