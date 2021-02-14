import type { DynamoDBStreamEvent } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import * as db from '~/utils/db'
import firstPass from './firstPass'
import subscribers from './subscribers'
import type { DBRecord } from 'ddbjs'

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

async function notifyEpisodes(
  podcast: string,
  episodes: DBRecord<typeof db['episodes']>[]
) {
  const first = episodes.filter(({ firstPass }) => firstPass)
  const known = episodes.filter(({ firstPass }) => !firstPass)
  await Promise.all([
    first.length > 0 && firstPass(podcast, first),
    known.length > 0 && subscribers(podcast, known),
  ])
}
