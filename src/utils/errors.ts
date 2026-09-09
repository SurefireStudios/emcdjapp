/**
 * Narrow a caught value to a human-readable message.
 *
 * `catch` binds `unknown`, so reading `.message` off it is not type-safe: a thrown string,
 * a rejected non-Error, or `undefined` would all crash the handler that is meant to be
 * reporting the failure.
 */
export function getErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred"
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return fallback;
}
