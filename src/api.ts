import RPC from 'typerpc'
import wsLambda from '~/transport'
import * as db from './utils/db'
import * as jwt from './utils/jwt'
import * as sync from '@picast-app/protocols/playbackSync'
import handleSyncMsg from './playSync'
import { pushToClients } from '~/utils/pushEpisodes'
import { Podcast } from '~/podcast'

const wsUrl = process.env.IS_OFFLINE
  ? 'http://localhost:3001'
  : 'socket.picast.app'

export const server = new RPC({
  identify: { params: String },
  subscribeEpisodes: { params: String },
  setCurrent: { params: [String, String, Number, String] },
  playSync: { params: { msg: Object, token: String } },
})

const transport = wsLambda(wsUrl)
server.addTransport(transport, { default: true })

const clientSchema = {
  episodeAdded: { params: { podcast: String, episodes: Object } },
  addEpisodes: { params: Object },
  seedComplete: { params: { podcasts: Object } },
  hasCovers: { params: { id: String, covers: Object, palette: Object } },
  hasAllEpisodes: { params: { podcast: String, total: Number } },
} as const
export type ClientSchema = typeof clientSchema

transport.on('connect', async id => {
  console.log('connect', id)
  try {
    await db.notifications.put({ pk: `ws#${id}`, sk: 'meta', ttl: ttl(5 / 60) })
  } catch (e) {
    console.error('connect failed', e)
  }
})

transport.on('disconnect', async id => {
  const con = await db.notifications.delete(`ws#${id}`, 'meta').returning('OLD')
  if (!con) return
  await Promise.all<any>([
    con.user && db.notifications.delete(`user#ws#${con.user}`, id),
    con.subs?.length &&
      db.notifications.batchDelete(
        ...con.subs.map(sub => [`ep_sub#${sub}`, id] as [string, string])
      ),
  ])
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

server.on('identify', async (token, caller) => {
  const decoded = jwt.decode(token)
  if (typeof decoded !== 'object' || decoded === null || !decoded.wsUser) return
  if (!caller) throw Error('caller missing')
  await Promise.all([
    storeWSUser(decoded.wsUser, caller as any),
    storeWSSession(decoded.session, caller as any),
  ])
})

async function storeWSUser(user: string, address: string) {
  await Promise.all([
    db.notifications.put({
      pk: `user#ws#${user}`,
      sk: address,
      ttl: ttl(),
    }),
    db.notifications.update([`ws#${address}`, 'meta'], { user }),
  ])
}

async function storeWSSession(session: string | undefined, address: string) {
  if (!session) return console.warn('no session')
  const existing: any = await db.notifications
    .put({ pk: `session#ws#${session}`, sk: 'session', address })
    .returning('OLD')

  if (!existing?.podcasts?.length)
    return console.log('no push queued for session', { address, existing })

  const [episodes] = await Promise.all([
    Podcast.episodes(existing.podcasts),
    db.notifications.delete(`session#ws#${session}`, 'session'),
  ])
  await pushToClients([address], episodes)
}

server.on('setCurrent', async ([podcast, episode, position, token]) => {
  const decoded = jwt.decode(token)
  if (typeof decoded !== 'object' || decoded === null || !decoded.wsUser)
    throw Error('unauthenticated')

  await Promise.all([
    db.users.update(`user#${decoded.wsUser}`, {
      current: { podcast, episode, position },
    }),
    db.playback.put({
      pk: `user#${decoded.wsUser}`,
      sk: `${podcast}.${episode}`,
      position,
      lastUpdate: new Date().toISOString(),
    }),
  ])
})

const isSyncMsg = (msg: any): msg is sync.Message<sync.Type> =>
  (typeof msg === 'object' && msg !== null && typeof msg.type !== 'number') ||
  typeof msg.time !== 'string'

server.on('playSync', async ({ msg, token }) => {
  const decoded = jwt.decode(token)
  if (typeof decoded !== 'object' || decoded === null || !decoded.wsUser)
    throw Error('unauthenticated')
  if (!isSyncMsg(msg)) throw Error('ill-formed sync message')
  await handleSyncMsg(msg, decoded.wsUser)
})

export const socket = async (event: any) => {
  await transport.in(event)
  return { statusCode: 200 }
}

function ttl(hours = 5) {
  return (Date.now() / 1000 + hours * 60 ** 2) | 0
}
