import * as db from '~/utils/db'
import { server } from '~/api'
import type { ClientSchema } from '~/api'
import type { DBRecord } from 'ddbjs'

export default async function notify(
  podcast: string,
  episodes: DBRecord<typeof db['episodes']>[]
) {
  const subscribers = await getWsEpisodeSubs(podcast)

  const selection = episodes.map(({ eId, title, published, url }) => ({
    id: eId,
    title,
    published,
    url,
  }))

  const inactive: string[] = []

  await Promise.all(
    subscribers.map(sub =>
      server
        .addConnection<ClientSchema>(sub)
        .notify('episodeAdded', { podcast, episodes: selection })
        .catch(() => inactive.push(sub))
    )
  )

  await disconnectInactiveWsSubs(podcast, inactive)
}

async function getWsEpisodeSubs(podcast: string): Promise<string[]> {
  const { Items } = await db.notifications.client
    .query({
      TableName: 'echo_notifications',
      KeyConditionExpression: 'pk = :pk ',
      ExpressionAttributeValues: { ':pk': `ep_sub#${podcast}` },
    })
    .promise()

  return Items.map(({ sk }) => sk)
}

async function disconnectInactiveWsSubs(podcast: string, subs: string[]) {
  if (!subs.length) return
  await db.notifications.batchDelete(
    ...subs.map(id => [`ep_sub#${podcast}`, id] as [string, string])
  )
}
