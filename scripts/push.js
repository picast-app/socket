const initDB = require('@picast-app/db').default
const webpush = require('web-push')
const { SSM } = require('aws-sdk')

const { notifications } = initDB({
  region: 'localhost',
  endpoint: 'http://localhost:8000',
})

main()
async function main() {
  await initPush()

  const { Items } = await notifications.client
    .scan({ TableName: notifications.table })
    .promise()

  const record = Items.filter(({ pk }) => /^user#wp/.test(pk))[0]
  const sub = JSON.parse(record.sub)

  const res = await webpush.sendNotification(sub, JSON.stringify(payload))
  console.log(res)
}

async function initPush() {
  const ssm = new SSM({ region: 'eu-west-1' })
  const {
    Parameter: { Value: publicKey },
  } = await ssm.getParameter({ Name: '/echo/webpush/key/public' }).promise()
  const {
    Parameter: { Value: privateKey },
  } = await ssm
    .getParameter({ Name: '/echo/webpush/key/private', WithDecryption: true })
    .promise()
  webpush.setVapidDetails('mailto:picast@bullinger.dev', publicKey, privateKey)
}

const payload = {
  type: 'episode',
  payload: {
    podcast: {
      id: '50s3',
      title: 'This Day in History Class',
      artwork: 'https://img.picast.app/50s3/art-512.jpeg',
    },
    episode: {
      id: 'qq06c05q1jz',
      title: 'Julius Caesar assassinated / Ogaden War ended - March 15',
    },
  },
}
