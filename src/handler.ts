import type { APIGatewayEvent } from 'aws-lambda'
import ws from '~/utils/ws'

export const socket = async (event: APIGatewayEvent) => {
  console.log(`\n\n\n==${event.requestContext.eventType}==\n\n`)

  if (event.requestContext.eventType === 'MESSAGE')
    await ws(event).send(event.requestContext.connectionId, {
      message: 'got a message',
      original: event.body,
    })

  return { statusCode: 200 }
}
