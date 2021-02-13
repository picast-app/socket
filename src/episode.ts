import type { DynamoDBStreamEvent } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import * as db from './utils/db'
import { server } from './api'
import type { ClientSchema } from './api'

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
  const subscribers = await getWsEpisodeSubs(podcast)

  episodes = episodes.map(({ eId, title, published, url }) => ({
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
        .notify('episodeAdded', {
          podcast,
          episodes,
        })
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
