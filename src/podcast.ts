import * as db from '~/utils/db'
import { performance } from 'perf_hooks'

export class Podcast {
  constructor(public readonly id: string) {}

  public async readEpisodes(): Promise<Episode[]> {
    return (await this.episodes())[0]
  }

  private async episodes(): Promise<[Episode[], number]> {
    const { items, requestCount } = await db.episodes
      .query(this.id)
      .select('eId', 'url', 'published', 'title', 'duration')

    return [
      items.map(({ eId, ...rest }) => ({
        id: eId,
        podcast: this.id,
        ...rest,
      })),
      requestCount,
    ]
  }

  public static async episodes(ids: string[]) {
    const t0 = performance.now()
    const data = await Promise.all(
      ids.map(id => new Podcast(id).episodes().then(v => [...v, id] as const))
    )
    const episodes = data.flatMap(([v]) => v)
    const dt = Math.round(performance.now() - t0)
    const queryCount = Object.fromEntries(data.map(([_, c, id]) => [id, c]))
    console.log(
      `queried ${episodes.length} episodes from ${ids.length} podcasts in ${dt} ms`,
      { queryCount }
    )
    return episodes
  }
}

export type Episode = {
  id: string
  podcast: string
  url: string
  published: string
  title: string
  duration: number
}
