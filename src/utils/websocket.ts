import * as db from '~/utils/db'

export async function getDirectClients(podcast: string): Promise<string[]> {
  const { Items } = await db.notifications.client
    .query({
      TableName: 'echo_notifications',
      KeyConditionExpression: 'pk = :pk ',
      ExpressionAttributeValues: { ':pk': `ep_sub#${podcast}` },
    })
    .promise()

  return Items.map(({ sk }) => sk)
}

export async function getUserClients(user: string): Promise<string[]> {
  const { client, table } = db.notifications
  const { Items } = await client
    .query({
      TableName: table,
      KeyConditionExpression: 'pk = :pk ',
      ExpressionAttributeValues: { ':pk': `user#ws#${user}` },
    })
    .promise()

  return Items.map(({ sk }) => sk)
}

export async function getPodSubClients(podcast: string): Promise<string[]> {
  const record = await db.podsubs.get(`podcast#${podcast}`)
  if (!record?.subscribers?.length) return []
  const userClients = await Promise.all(
    record.subscribers.map(user => getUserClients(user))
  )
  return userClients.flat()
}

export async function disconnectInactive({
  users = {},
  podcasts = {},
}: {
  users?: Record<string, string[]>
  podcasts?: Record<string, string[]>
}) {
  const clients = [
    ...Object.entries(users).flatMap(([user, clients]) =>
      clients.map(sk => [`user#ws#${user}`, sk] as [string, string])
    ),
    ...Object.entries(podcasts).flatMap(([podcast, clients]) =>
      clients.map(sk => [`ep_sub#${podcast}`, sk] as [string, string])
    ),
  ]
  if (clients.length) await db.notifications.batchDelete(...clients)
}
