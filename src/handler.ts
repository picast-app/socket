import type { APIGatewayEvent, DynamoDBStreamEvent } from 'aws-lambda'
import { ddb } from '~/utils/aws'

export const socket = async (event: APIGatewayEvent) => {
  if (event.requestContext.eventType === 'CONNECT')
    await connect(event.requestContext.connectionId)
  else if (event.requestContext.eventType === 'DISCONNECT')
    await disconnect(event.requestContext.connectionId)
  else if (event.requestContext.eventType === 'MESSAGE') {
    try {
      await handleMessage(event.body, event.requestContext.connectionId)
    } catch (error) {
      console.error('error in message handler', { event, error })
    }
  }

  return { statusCode: 200 }
}

async function handleMessage(raw: string, conId: string) {
  const { type, ...msg } = JSON.parse(raw)

  switch (type) {
    case 'SUB_EPISODES':
      await Promise.all([
        ddb
          .put({
            TableName: 'echo_notifications',
            Item: {
              pk: `ep_sub#${msg.podcast}`,
              sk: conId,
              ttl: ttl(),
            },
          })
          .promise(),
        ddb
          .update({
            TableName: 'echo_notifications',
            Key: { pk: `ws#${conId}`, sk: 'meta' },
            UpdateExpression: 'ADD subs :pId',
            ExpressionAttributeValues: { ':pId': ddb.createSet([msg.podcast]) },
          })
          .promise(),
      ])
      break
    default:
      throw new Error(`invalid type "${type}"`)
  }
}

async function connect(conId) {
  await ddb
    .put({
      TableName: 'echo_notifications',
      Item: {
        pk: `ws#${conId}`,
        sk: 'meta',
        subs: ddb.createSet(['_']),
        ttl: ttl(),
      },
    })
    .promise()
}

async function disconnect(conId: string) {
  const { Attributes } = await ddb
    .delete({
      TableName: 'echo_notifications',
      Key: { pk: `ws#${conId}`, sk: 'meta' },
      ReturnValues: 'ALL_OLD',
    })
    .promise()
  const toDelete = Attributes?.subs.values?.filter(v => v !== '_') ?? []
  if (!toDelete.length) return
  await ddb
    .batchWrite({
      RequestItems: {
        echo_notifications: toDelete.map(id => ({
          DeleteRequest: { Key: { pk: `ep_sub#${id}`, sk: conId } },
        })),
      },
    })
    .promise()
}

export const episode = async (event: DynamoDBStreamEvent) => {
  event.Records.forEach(v => {
    console.log(`${v.eventName}`, v.dynamodb.NewImage ?? v.dynamodb.OldImage)
  })

  const added = event.Records.filter(
    ({ eventName }) => eventName === 'INSERT'
  ).map(({ dynamodb }) => dynamodb.NewImage)

  console.log(added)
}

function ttl(hours = 2) {
  return (Date.now() / 1000 + hours * 60 ** 2) | 0
}
