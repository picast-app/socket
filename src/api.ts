import RPC from 'typerpc'
import wsLambda from 'typerpc/transport/ws/lambda'
import * as db from './utils/db'
import * as jwt from './utils/jwt'

const wsUrl = process.env.IS_OFFLINE
  ? 'http://localhost:3001'
  : 'socket.picast.app'

export const server = new RPC({
  identify: { params: String },
  subscribeEpisodes: { params: String },
})

const transport = wsLambda(wsUrl)
server.addTransport(transport, { default: true })

const clientSchema = {
  episodeAdded: { params: { podcast: String, episodes: Object } },
} as const
export type ClientSchema = typeof clientSchema

transport.on('connect', async id => {
  console.log('connect', id)
  try {
    await db.notifications.put({ pk: `ws#${id}`, sk: 'meta', ttl: ttl() })
  } catch (e) {
    console.error('connect failed', e)
  }
})

transport.on('disconnect', async id => {
  const con = await db.notifications.delete(`ws#${id}`, 'meta').returning('OLD')
  if (!con?.subs?.length) return
  await db.notifications.batchDelete(
    ...con.subs.map(sub => [`ep_sub#${sub}`, id] as [string, string])
  )
})

// @ts-ignore
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

// @ts-ignore
server.on('identify', async (token, caller) => {
  const { wsUser } = jwt.decode(token)
  if (wsUser)
    await db.notifications.put({
      pk: `user#${wsUser}`,
      sk: caller as any,
      ttl: ttl(),
    })
})

export const socket = async (event: any) => {
  await transport.in(event)
  return { statusCode: 200 }
}

function ttl(hours = 5) {
  return (Date.now() / 1000 + hours * 60 ** 2) | 0
}