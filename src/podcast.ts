import * as db from '~/utils/db'

export class Podcast {
  constructor(public readonly id: string) {}

  public async readEpisodes(): Promise<Episode[]> {
    const { items } = await db.episodes
      .query(this.id)
      .select('eId', 'url', 'published', 'title', 'duration')

    return items.map(({ eId, ...rest }) => ({
      id: eId,
      podcast: this.id,
      ...rest,
    }))
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
