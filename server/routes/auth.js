import express from 'express'
import bcrypt from 'bcrypt'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { PrismaClient } from '@prisma/client'
import { generateToken, authenticateToken } from '../middleware/auth.js'

const router = express.Router()
const prisma = new PrismaClient()

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL || 'http://localhost:6969'}/api/v1/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await prisma.user.findUnique({
            where: { googleId: profile.id },
          })

          if (!user) {
            // Check if user exists with this email
            user = await prisma.user.findUnique({
              where: { email: profile.emails[0].value },
            })

            if (user) {
              // Link Google account to existing user
              user = await prisma.user.update({
                where: { id: user.id },
                data: { googleId: profile.id },
              })
            } else {
              // Create new user
              user = await prisma.user.create({
                data: {
                  email: profile.emails[0].value,
                  name: profile.displayName || profile.name?.givenName || null,
                  googleId: profile.id,
                },
              })
            }
          }

          return done(null, user)
        } catch (error) {
          return done(error, null)
        }
      }
    )
  )
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } })
    done(null, user)
  } catch (error) {
    done(error, null)
  }
})

// Sign up with email/password
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        data: null,
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
        data: null,
      })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists',
        data: null,
      })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name: fullName || null,
        password: hashedPassword,
      },
    })

    // Generate JWT token
    const token = generateToken(user)

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
    })
  } catch (error) {
    console.error('Signup error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Signup failed',
      data: null,
    })
  }
})

// Sign in with email/password
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        data: null,
      })
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        data: null,
      })
    }

    // Check if user has password (not Google-only account)
    if (!user.password) {
      return res.status(401).json({
        success: false,
        error: 'Please sign in with Google',
        data: null,
      })
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        data: null,
      })
    }

    // Generate JWT token
    const token = generateToken(user)

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
    })
  } catch (error) {
    console.error('Signin error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Signin failed',
      data: null,
    })
  }
})

// Google OAuth - Initiate
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

// Google OAuth - Callback
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    try {
      const user = req.user
      const token = generateToken(user)

      // Redirect to frontend with token
      res.redirect(`${FRONTEND_URL}/auth/google/callback?token=${token}`)
    } catch (error) {
      console.error('Google callback error:', error)
      res.redirect(`${FRONTEND_URL}/signin?error=google_auth_failed`)
    }
  }
)

// Verify token
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        data: null,
      })
    }

    res.json({
      success: true,
      data: { user },
    })
  } catch (error) {
    console.error('Verify token error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Token verification failed',
      data: null,
    })
  }
})

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        preferences: true,
      },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        data: null,
      })
    }

    res.json({
      success: true,
      data: { user },
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user',
      data: null,
    })
  }
})

export default router
