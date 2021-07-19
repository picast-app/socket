import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:picast@bullinger.dev',
  process.env.VAPID_PUBLIC!,
  process.env.VAPID_PRIVATE!
)

export default webpush
