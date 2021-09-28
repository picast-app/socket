import initDB from '@picast-app/db'

export const { notifications, podcasts, episodes, podsubs, users, playback } =
  initDB(
    process.env.IS_OFFLINE
      ? {
          region: 'localhost',
          endpoint: 'http://localhost:8000',
        }
      : undefined
  )

export type Episode = {
  pId: string
  eId: string
  url?: string
  guid?: string
  published?: string
  title?: string
  shownotes?: string
  firstPass?: boolean
  duration?: number
}
