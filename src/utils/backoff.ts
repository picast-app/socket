import type { PromType, λ } from 'snatchblock/types'

const sleep = async (ms: number) =>
  await new Promise<void>(res => setTimeout(res, ms))

export const backoff = <T extends λ>(
  task: T,
  shouldRetry: (err: unknown, delay: number) => boolean = (_, ms) => ms < 1000
) => {
  let retries = 0

  const attempt = async (
    ...args: Parameters<T>
  ): Promise<PromType<ReturnType<T>>> => {
    try {
      return await task(...args)
    } catch (err) {
      const delay = 2 ** retries++ * 100
      if (!shouldRetry(err, delay)) throw err
      console.log(`retry (${retries}) after ${delay} ms`)
      await sleep(delay)
      return await attempt(...args)
    }
  }

  return attempt
}
