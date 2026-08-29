// Call at the point of use rather than at import, so a command that doesn't
// need a variable doesn't fail on it.
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`${name} must be set`);
  }

  return value;
}
