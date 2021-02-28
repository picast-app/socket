import type { episodes } from '~/utils/db'
import type { DBRecord } from 'ddbjs'

const pick = <T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> =>
  Object.fromEntries(
    Object.entries(obj).filter(([k]) => keys.includes(k as K))
  ) as any

export const episode = (episode: DBRecord<typeof episodes>) => ({
  id: episode.eId,
  ...pick(episode, 'title', 'published', 'url', 'duration'),
})
