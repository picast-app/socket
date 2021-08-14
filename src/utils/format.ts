const pick = <T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> =>
  Object.fromEntries(
    Object.entries(obj).filter(([k]) => keys.includes(k as K))
  ) as any

export const episode = (episode: any) => ({
  id: episode.eId,
  ...pick(episode, 'title', 'published', 'url', 'duration'),
})
