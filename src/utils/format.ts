import type { Episode } from '~/utils/db'

const pick = <T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> =>
  Object.fromEntries(
    Object.entries(obj).filter(([k]) => keys.includes(k as K))
  ) as any

export const episode = (episode: Episode) =>
  omitNullish({
    id: episode.eId,
    podcast: episode.pId,
    ...pick(episode, 'title', 'published', 'url', 'duration'),
  })

const omitNullish = <T>(
  value: T
): { [K in keyof T as T[K] extends null | undefined ? never : K]: T[K] } =>
  Object.fromEntries(
    Object.entries(value).filter((_, v) => v !== null && v !== undefined)
  ) as any
