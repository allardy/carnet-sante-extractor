export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Runs `fn` over `items` with at most `limit` in flight at once, preserving result order.
export const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor

      cursor += 1
      results[index] = await fn(items[index] as T, index)
    }
  }

  const size = Math.max(1, Math.min(limit, items.length))

  await Promise.all(Array.from({ length: size }, () => worker()))

  return results
}
