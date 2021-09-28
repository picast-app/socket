import { server, ClientSchema } from '~/api'
import type { Episode } from '~/podcast'
import * as predicate from 'snatchblock/predicate'

export async function pushToClients(clients: string[], episodes: Episode[]) {
  if (!clients.length || !episodes.length) return
  const batches = batchEpisodes(episodes)
  const byPod = batches.map(batch => byKey(batch, 'podcast'))

  const res = await Promise.allSettled(
    clients.map(id => pushToClient(id, byPod))
  )
  res
    .filter(predicate.isRejected)
    .forEach(v => console.error('failed to push to client', { ...v, clients }))
}

async function pushToClient(
  client: string,
  batches: Record<string, Partial<Episode>[]>[]
) {
  const con = server.addConnection<ClientSchema>(client)
  const podcasts = Array.from(new Set(batches.flatMap(v => Object.keys(v))))
  await Promise.all(batches.map(batch => con.notify('addEpisodes', batch)))
  await con.notify('seedComplete', { podcasts })
}

function batchEpisodes(episodes: Episode[]): Episode[][] {
  const bufferBytes = 0.1 * 1024
  const limit = 32 * 1024 - bufferBytes

  const batches: [number, Episode[]][] = [[0, []]]

  const encoder = new TextEncoder()
  for (const episode of episodes) {
    const size = encoder.encode(JSON.stringify(episode) + 10).byteLength

    const last = batches[batches.length - 1]
    if (last[0] + size > limit) {
      if (size > limit)
        console.warn(
          `episode is larger than frame size limit (${size} > ${limit})`,
          { episode }
        )
      batches.push([size, [episode]])
    } else {
      last[0] += size
      last[1].push(episode)
    }
  }

  return batches.map(([_, batch]) => batch)
}

const byKey = <T, K extends keyof T>(
  list: T[],
  key: K | ((v: T) => K)
): { [P in T[K] extends string ? T[K] : never]: Omit<T, K>[] } => {
  const dict: any = {}
  for (const item of list) {
    const itemKey = typeof key === 'function' ? key(item) : item[key]
    ;(dict[itemKey] ??= []).push(item)
  }
  return dict
}
