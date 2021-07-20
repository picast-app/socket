import { Message, Type } from '@picast-app/protocols/playbackSync'
import assert from 'assert'
import * as db from './utils/db'

export default async function handleMessage(msg: Message<Type>, user: string) {
  if (msg.type in handlers) await handlers[msg.type]!(msg, user)
  else throw Error(`no handler for sync message of type ${msg.type}`)
}

const handlers: { [K in Type]?: λ<[msg: any, user: string]> } = {
  [Type.SET_ACTIVE]: setActive,
}

async function setActive(msg: Message<Type.SET_ACTIVE>, user: string) {
  assert(msg.id.length === 2 && msg.id.every(v => v && typeof v === 'string'))
  await Promise.all([
    db.users.update(`user#${user}`, {
      current: {
        podcast: msg.id[0],
        episode: msg.id[1],
        position: msg.pos ?? 0,
      },
    }),
    db.playback.put({
      pk: `user#${user}`,
      sk: msg.id.join('.'),
      position: msg.pos ?? 0,
      lastUpdate: new Date().toISOString(),
    }),
  ])
}
