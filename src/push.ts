import { server, ClientSchema } from '~/api'
import * as ws from '~/utils/websocket'
import type { SNSEvent } from 'aws-lambda'
import * as db from '~/utils/db'
import * as jwt from './utils/jwt'
import { pushToClients } from './utils/pushEpisodes'
import { Podcast } from './podcast'

export const handler = async (event: SNSEvent) => {
  const tasks: Promise<any>[] = []

  for (const record of event.Records) {
    const msg = JSON.parse(record.Sns.Message)
    console.log(msg)
    if (msg.type === 'HAS_COVERS') tasks.push(pushCovers(msg))
    if (msg.type === 'HAS_TOTAL') tasks.push(pushTotal(msg))
    if (msg.type === 'PUSH_EPISODES') tasks.push(pushEpisodes(msg))
  }

  for (const res of await Promise.allSettled(tasks))
    if (res.status === 'rejected') console.error('task failed', res)
}

async function pushCovers({
  podcast,
  covers,
  palette,
}: {
  podcast: string
  covers: string[]
  palette: any
}) {
  const subs = (
    await Promise.all([
      ws.getDirectClients(podcast),
      ws.getPodSubClients(podcast),
    ])
  ).flat()

  await Promise.allSettled(
    subs.map(sub =>
      server
        .addConnection<ClientSchema>(sub)
        .notify('hasCovers', { id: podcast, covers, palette })
    )
  )
}

async function pushTotal(msg: { podcast: string; total: number }) {
  const subs = await ws.getDirectClients(msg.podcast)

  const inactive: string[] = []
  await Promise.all(
    subs.map(sub =>
      server
        .addConnection<ClientSchema>(sub)
        .notify('hasAllEpisodes', msg)
        .catch(() => inactive.push(sub))
    )
  )
  await ws.disconnectInactive({ podcasts: { [msg.podcast]: inactive } })
}

async function pushEpisodes(msg: { podcasts: string[]; userToken: string }) {
  const decoded = jwt.decode(msg.userToken)
  if (typeof decoded !== 'object' || decoded === null || !decoded.session)
    return console.error('invalid userToken', { decoded })

  const session: any = await db.notifications.get(
    `session#ws${decoded.session}`,
    'session'
  )
  if (!session?.address) {
    await db.notifications
      .put({
        pk: `session#ws#${decoded.session}`,
        sk: 'session',
        podcasts: msg.podcasts,
      })
      .cast({ podcasts: 'Set' })
    return
  }

  const episodes = await Promise.all(
    msg.podcasts.map(id => new Podcast(id).readEpisodes())
  )
  await pushToClients([session.address], episodes.flat())
}
