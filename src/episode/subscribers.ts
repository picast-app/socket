import * as db from '~/utils/db'
import { server } from '~/api'
import type { ClientSchema } from '~/api'
import type { DBRecord } from 'ddbjs'
import * as format from '~/utils/format'

export default async function notify(
  podcast: string,
  episodes: DBRecord<typeof db['episodes']>[]
) {
  console.log('notify subscribers')
  const users = await getSubscribers(podcast)

  const selection = episodes.map(format.episode)

  await Promise.all(users.map(user => notifyUser(user, podcast, selection)))
}

async function getSubscribers(podcast: string): Promise<string[]> {
  const record = await db.podsubs.get(`podcast#${podcast}`)
  return record.subscribers ?? []
}

async function notifyUser(
  user: string,
  podcast: string,
  episodes: Partial<DBRecord<typeof db['episodes']>>[]
) {
  const { client, table } = db.notifications
  const { Items } = await client
    .query({
      TableName: table,
      KeyConditionExpression: 'pk = :pk ',
      ExpressionAttributeValues: { ':pk': `user#ws#${user}` },
    })
    .promise()

  const inactive: [string, string][] = []

  await Promise.all(
    Items.map(({ pk, sk }) =>
      server
        .addConnection<ClientSchema>(sk)
        .notify('episodeAdded', { podcast, episodes })
        .catch(() => inactive.push([pk, sk]))
    )
  )

  await disconnectInactive(inactive)
}

async function disconnectInactive(clients: [string, string][]) {
  if (!clients.length) return
  await db.notifications.batchDelete(...clients)
}
