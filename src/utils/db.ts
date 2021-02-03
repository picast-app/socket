import initDB from '@picast-app/db'

export const { notifications } = initDB(
  process.env.IS_OFFLINE
    ? {
        region: 'localhost',
        endpoint: 'http://localhost:8000',
      }
    : undefined
)
