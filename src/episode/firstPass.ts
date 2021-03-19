import * as db from '~/utils/db'
import { server } from '~/api'
import * as format from '~/utils/format'
import type { ClientSchema } from '~/api'
import type { DBRecord } from 'ddbjs'
import * as ws from '~/utils/websocket'

export default async function notify(
  podcast: string,
  episodes: DBRecord<typeof db['episodes']>[]
) {
  const subscribers = await ws.getDirectClients(podcast)
  const selection = episodes.map(format.episode)
  const inactive: string[] = []

  await Promise.all(
    subscribers.map(sub =>
      server
        .addConnection<ClientSchema>(sub)
        .notify('episodeAdded', { podcast, episodes: selection })
        .catch(() => inactive.push(sub))
    )
  )

  await ws.disconnectInactive({ podcasts: { [podcast]: inactive } })
}
