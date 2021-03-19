import { server, ClientSchema } from '~/api'
import * as ws from '~/utils/websocket'
import type { SNSEvent } from 'aws-lambda'

export const handler = async (event: SNSEvent) => {
  const tasks: Promise<any>[] = []

  for (const record of event.Records) {
    const msg = JSON.parse(record.Sns.Message)
    console.log(msg)
    if (msg.type === 'HAS_COVERS') tasks.push(pushCovers(msg))
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
