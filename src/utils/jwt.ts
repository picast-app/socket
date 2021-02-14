import jwt from 'jsonwebtoken'

export const decode = (token: string) => {
  if (!token) return
  try {
    return jwt.verify(token, process.env.PUBLIC_KEY)
  } catch (e) {
    console.error(e)
    if (e instanceof jwt.JsonWebTokenError) return
    throw e
  }
}
