const stamp = (): string => new Date().toISOString()

export const log = {
  info: (message: string, ...rest: unknown[]): void => console.info(`[${stamp()}] ${message}`, ...rest),
  warn: (message: string, ...rest: unknown[]): void => console.warn(`[${stamp()}] ⚠ ${message}`, ...rest),
  error: (message: string, ...rest: unknown[]): void => console.error(`[${stamp()}] ✖ ${message}`, ...rest),
  step: (message: string): void => console.info(`\n▶ ${message}`),
}
