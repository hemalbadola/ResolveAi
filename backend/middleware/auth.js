const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'resolveai-secret-key'

const authenticate = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' })

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token.' })
  }
}

const authorize = (roles = []) => {
  if (typeof roles === 'string') roles = [roles]
  return (req, res, next) => {
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

module.exports = { authenticate, authorize }
