import AWS from 'aws-sdk'

const gateway = new AWS.ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: process.env.IS_OFFLINE
    ? 'http://localhost:3001'
    : 'socket.picast.app',
})

export const send = async (ConnectionId: string, data: unknown) =>
  await gateway
    .postToConnection({
      ConnectionId,
      Data: typeof data === 'string' ? data : JSON.stringify(data),
    })
    .promise()
