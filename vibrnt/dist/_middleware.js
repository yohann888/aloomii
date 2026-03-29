/**
 * Vibrnt Dashboard — Public Access (Auth Removed)
 * Passthrough — no auth gate.
 */

export async function onRequest(context) {
  return next(context);
}
