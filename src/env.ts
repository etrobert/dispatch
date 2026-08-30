// Call at the point of use rather than at import, so a command that doesn't
// need a variable doesn't fail on it.
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`${name} must be set`);
  }

  return value;
}

// Same lateness, for a variable that only tunes something already working: an
// unset one is not an error, it just leaves the caller's default in place.
export function envOr(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}
