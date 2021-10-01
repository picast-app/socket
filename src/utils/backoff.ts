import type { PromType, λ } from 'snatchblock/types'

const sleep = async (ms: number) =>
  await new Promise<void>(res => setTimeout(res, ms))

export const backoff = <T extends λ>(
  task: T,
  shouldRetry: (err: unknown, delay: number) => boolean = (_, ms) => ms < 1000
) => {
  const attempt = async (
    retries: number,
    ...args: Parameters<T>
  ): Promise<PromType<ReturnType<T>>> => {
    try {
      return await task(...args)
    } catch (err) {
      const delay = 2 ** retries * 100
      if (!shouldRetry(err, delay)) throw err
      console.log(`retry (${retries}) after ${delay} ms`)
      await sleep(delay)
      return await attempt(retries + 1, ...args)
    }
  }
  return async (...args: Parameters<T>) => await attempt(0, ...args)
}
