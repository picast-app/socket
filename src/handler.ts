import type { APIGatewayEvent } from 'aws-lambda'
import { send } from '~/utils/ws'

export const socket = async (event: APIGatewayEvent) => {
  console.log(`\n\n\n==${event.requestContext.eventType}==\n\n`)

  if (event.requestContext.eventType === 'MESSAGE')
    await send(event.requestContext.connectionId, {
      message: 'got a message',
      original: event.body,
    })
}
