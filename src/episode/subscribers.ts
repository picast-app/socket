import * as db from '~/utils/db'
import { server } from '~/api'
import type { ClientSchema } from '~/api'
import type { DBRecord } from 'ddbjs'
import * as format from '~/utils/format'
import webpush from '~/utils/webpush'

export default async function notify(
  podcast: string,
  episodes: DBRecord<typeof db['episodes']>[]
) {
  console.log('notify subscribers')

  const record = await db.podsubs.get(`podcast#${podcast}`)
  if (!record) return

  await Promise.allSettled([
    wsPush(record.subscribers, podcast, episodes),
    webPush(record.wpSubs, podcast, episodes),
  ])
}

async function wsPush(
  users: string[],
  podcast: string,
  episodes: DBRecord<typeof db['episodes']>[]
) {
  if (!users?.length) return
  const selection = episodes.map(format.episode)
  await Promise.all(users.map(user => notifyUser(user, podcast, selection)))
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

async function webPush(
  users: string[],
  podcast: string,
  episodes: DBRecord<typeof db['episodes']>[]
) {
  if (!users?.length) return
  console.log(`web push to ${users.length} users`)

  const { id, title, covers } = await db.podcasts.get(podcast)

  let artwork: string | undefined = undefined
  if (covers?.length) {
    try {
      artwork = `https://img.picast.app/${
        (covers as string[])
          .filter(v => /\.jpeg$/.test(v))
          .map(path => ({
            path,
            size: parseInt(path.split('.')[0].split('-').pop()!),
          }))
          .sort(({ size: a }, { size: b }) => a - b)[0].path
      }`
    } catch (error) {
      console.error('failed to select artwork', { error })
    }
  }

  const msgs = episodes.map(ep =>
    JSON.stringify({
      type: 'episode',
      payload: {
        podcast: { id, title, ...(artwork && { artwork }) },
        episode: { id: ep.eId, title: ep.title },
      },
    })
  )

  await Promise.allSettled(users.map(user => pushUser(user, msgs)))
}

async function pushUser(user: string, msgs: string[]) {
  const { client, table } = db.notifications
  const { Items } = await client
    .query({
      TableName: table,
      KeyConditionExpression: 'pk = :pk ',
      ExpressionAttributeValues: { ':pk': `user#wp#${user}` },
    })
    .promise()

  if (!Items.length) return
  console.log(`web push ${user} to ${Items.length} clients`)

  await Promise.all(
    Items.map(({ sub }) => JSON.parse(sub)).flatMap(sub =>
      msgs.map(msg => sendPushNotification(sub, msg))
    )
  )
}

async function sendPushNotification(sub: any, msg: string) {
  try {
    await webpush.sendNotification(sub, msg)
  } catch (error) {
    console.error('failed to send push notification', { sub, msg, error })
  }
}
