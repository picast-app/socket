import type { DynamoDBStreamEvent } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import RPC from 'typerpc'
import wsLambda from 'typerpc/transport/ws/lambda'
import * as db from './utils/db'

const wsUrl = process.env.IS_OFFLINE
  ? 'http://localhost:3001'
  : 'socket.picast.app'

const server = new RPC({
  add: { params: [Number, Number], result: Number },
  subscribeEpisodes: { params: String },
})

const clientSchema = {
  episodeAdded: { params: { podcast: String, episodes: Object } },
} as const
type ClientSchema = typeof clientSchema

const transport = wsLambda(wsUrl)
server.addTransport(transport, { default: true })

transport.on('connect', async id => {
  await db.notifications.put({ pk: `ws#${id}`, sk: 'meta', ttl: ttl() })
})

transport.on('disconnect', async id => {
  const con = await db.notifications.delete(`ws#${id}`, 'meta').returning('OLD')
  if (!con?.subs?.length) return
  await db.notifications.batchDelete(
    ...con.subs.map(sub => [`ep_sub#${sub}`, id] as [string, string])
  )
})

server.on('subscribeEpisodes', async (podcast, caller) => {
  await Promise.all([
    db.notifications.put({
      pk: `ep_sub#${podcast}`,
      sk: caller as any,
      ttl: ttl(),
    }),
    db.notifications.update([`ws#${caller}`, 'meta']).add({ subs: [podcast] }),
  ])
})

export const socket = transport.createHandler()

export const episode = async (event: DynamoDBStreamEvent) => {
  event.Records.forEach(v => {
    console.log(`${v.eventName}`, v.dynamodb!.NewImage ?? v.dynamodb!.OldImage)
  })

  const added: any[] = event.Records.filter(
    ({ eventName }) => eventName === 'INSERT'
  ).map(({ dynamodb }) => DynamoDB.Converter.unmarshall(dynamodb!.NewImage!))

  const byPodcast: Record<string, any> = {}

  for (const ep of added) {
    if (!(ep.pId in byPodcast)) byPodcast[ep.pId] = []
    byPodcast[ep.pId].push(ep)
  }

  await Promise.all(
    Object.entries(byPodcast).map(([k, v]) => notifyEpisodes(k, v))
  )
}

async function notifyEpisodes(podcast: string, episodes: any[]) {
  const { Items } = await db.notifications.client
    .query({
      TableName: 'echo_notifications',
      KeyConditionExpression: 'pk = :pk ',
      ExpressionAttributeValues: { ':pk': `ep_sub#${podcast}` },
    })
    .promise()

  await Promise.all(
    Items!.map(({ sk }) =>
      server.addConnection<ClientSchema>(sk).notify('episodeAdded', {
        podcast,
        episodes: episodes.map(({ eId, title, published, url }) => ({
          id: eId,
          title,
          published,
          url,
        })),
      })
    )
  )
}

function ttl(hours = 5) {
  return (Date.now() / 1000 + hours * 60 ** 2) | 0
}
