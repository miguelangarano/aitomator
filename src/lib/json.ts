export function parseJson(value: string | null | undefined, fallback: unknown = null): unknown { if (!value) return fallback; try { return JSON.parse(value) } catch { return fallback } }
export function stringify(value: unknown): string | null { if (value === undefined) return null; try { return JSON.stringify(value) } catch { return JSON.stringify(String(value)) } }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.stack ?? error.message : String(error) }
