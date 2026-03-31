const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

// Password regex: minimum 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#+\-_])[A-Za-z\d@$!%*?&#+\-_]{8,}$/

module.exports = ({ User }) => {
  const router = express.Router()
  const JWT_SECRET = process.env.JWT_SECRET || 'resolveai-secret-key'

  // Register
  router.post('/register', async (req, res) => {
    try {
      const { username, password, role } = req.body
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

      // Username validation
      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' })
      }

      // Password strength validation
      if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).json({ 
          error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character (@$!%*?&#+_-)' 
        })
      }
      
      const existing = await User.findOne({ username })
      if (existing) return res.status(400).json({ error: 'Username already exists' })

      const hashedPassword = await bcrypt.hash(password, 10)
      const user = new User({ username, password: hashedPassword, role: role || 'user' })
      await user.save()

      res.status(201).json({ message: 'User registered successfully' })
    } catch (e) {
      res.status(500).json({ error: 'Registration failed' })
    }
  })

  // Login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body
      const user = await User.findOne({ username })
      if (!user) return res.status(401).json({ error: 'Invalid credentials' })

      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' })

      const token = jwt.sign(
        { id: user._id, role: user.role, username: user.username },
        JWT_SECRET,
        { expiresIn: '4h' }
      )
      res.json({ token, role: user.role, username: user.username, id: user._id })
    } catch (e) {
      res.status(500).json({ error: 'Login failed' })
    }
  })

  return router
}
