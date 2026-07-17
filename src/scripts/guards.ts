// Side-effect-free guards for destructive maintenance scripts (unit-testable).

/**
 * True when a wipe should be refused: we're in production and the operator
 * has not explicitly forced it.
 */
export function shouldRefuseWipe(
  nodeEnv: string | undefined,
  force: boolean,
): boolean {
  return nodeEnv === "production" && !force;
}
