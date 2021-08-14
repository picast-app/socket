import { Message, Type } from '@picast-app/protocols/playbackSync'
import assert from 'assert'
import * as db from './utils/db'

export default async function handleMessage(msg: Message<Type>, user: string) {
  if (msg.type in handlers) await handlers[msg.type]!(msg, user)
  else throw Error(`no handler for sync message of type ${msg.type}`)
}

const handlers: { [K in Type]?: λ<[msg: any, user: string]> } = {
  SET_ACTIVE: setActive,
  SET_PLAYBACK_TIME: setTime,
}

async function setActive(msg: Message<'SET_ACTIVE'>, user: string) {
  assertEpisodeId(msg)
  assert(user)
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

async function setTime(msg: Message<'SET_PLAYBACK_TIME'>, user: string) {
  assertEpisodeId(msg)
  assert(user)

  await Promise.all([
    db.playback.update([`user#${user}`, msg.id.join('.')], {
      position: msg.pos,
      lastUpdate: new Date().toISOString(),
    }),
    db.users
      .update(`user#${user}`, { current: { position: msg.pos } })
      .if({ path: 'current.episode' }, '=', msg.id[1])
      .catch(() => {}),
  ])
}

function assertEpisodeId(msg: any) {
  assert(
    msg.id.length === 2 && msg.id.every((v: any) => v && typeof v === 'string')
  )
}
