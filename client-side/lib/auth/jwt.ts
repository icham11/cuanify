import jwt from "jsonwebtoken"

const JWT_SECRET =
  process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || ""

function getJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error(
      "Missing JWT secret. Set JWT_SECRET (or NEXTAUTH_SECRET) in your environment."
    )
  }
  return JWT_SECRET
}

export function signToken(payload: object) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "7d",
  })
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, getJwtSecret())
  } catch {
    return null
  }
}
