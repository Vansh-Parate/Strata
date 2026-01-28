import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import passport from 'passport'
import session from 'express-session'
import { PrismaClient } from '@prisma/client'
import { authenticateToken } from './middleware/auth.js'
import demoRoutes from './routes/demo.js'
import authRoutes from './routes/auth.js'
import uploadRoutes from './routes/upload.js'
import recommendationsRoutes from './routes/recommendations.js'

const prisma = new PrismaClient()
const app = express()
const PORT = process.env.PORT || 6969

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
  })
)
app.use(passport.initialize())
app.use(passport.session())

// Routes
app.use('/api/v1/auth', authRoutes)
app.use('/api', uploadRoutes)
app.use('/api/recommendations', recommendationsRoutes)
app.use(demoRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Analytics endpoints
app.get('/api/analytics/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const attempts = await prisma.questionAttempt.findMany({
      where: { userId },
      orderBy: { attemptedAt: 'desc' },
    })

    const totalAttempts = attempts.length
    const correctAttempts = attempts.filter(a => a.correctness).length
    const avgAccuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : 0
    const avgTime = totalAttempts > 0
      ? attempts.reduce((sum, a) => sum + a.timeTakenSeconds, 0) / totalAttempts
      : 0

    // Calculate mastery (weighted by recency)
    const now = new Date()
    const masteryScores = attempts.map(a => {
      const daysAgo = (now - a.attemptedAt) / (1000 * 60 * 60 * 24)
      const weight = Math.pow(0.5, daysAgo / 7) // Recency decay
      return { correctness: a.correctness ? 1 : 0, weight }
    })

    const totalWeight = masteryScores.reduce((sum, m) => sum + m.weight, 0)
    const weightedMastery = totalWeight > 0
      ? (masteryScores.reduce((sum, m) => sum + m.correctness * m.weight, 0) / totalWeight) * 100
      : 0

    // Calculate trend (last 10 vs previous 10)
    const recent10 = attempts.slice(0, 10)
    const previous10 = attempts.slice(10, 20)
    const recentAccuracy = recent10.length > 0
      ? (recent10.filter(a => a.correctness).length / recent10.length) * 100
      : 0
    const previousAccuracy = previous10.length > 0
      ? (previous10.filter(a => a.correctness).length / previous10.length) * 100
      : 0
    const trend = recentAccuracy - previousAccuracy

    res.json({
      success: true,
      error: null,
      data: {
        totalAttempts,
        avgAccuracy: Math.round(avgAccuracy * 10) / 10,
        avgTime: Math.round(avgTime),
        mastery: Math.round(weightedMastery * 10) / 10,
        trend: Math.round(trend * 10) / 10,
      },
    })
  } catch (error) {
    console.error('Error fetching summary:', error)
    res.status(500).json({ success: false, error: error.message, data: null })
  }
})

app.get('/api/analytics/topic-mastery', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const attempts = await prisma.questionAttempt.findMany({
      where: { userId },
      orderBy: { attemptedAt: 'desc' },
    })

    if (attempts.length === 0) {
      return res.json({ success: true, error: null, data: [] })
    }

    // Calculate global averages for normalization
    const allTimes = attempts.map(a => a.timeTakenSeconds)
    const avgTimeGlobal = allTimes.reduce((sum, t) => sum + t, 0) / allTimes.length
    const maxTimeGlobal = Math.max(...allTimes, 1)
    const minTimeGlobal = Math.min(...allTimes, 0)

    // Group by topic and calculate mastery with multiple signals
    const topicMap = new Map()
    const now = new Date()

    attempts.forEach(attempt => {
      const metadata = attempt.questionMetadata
      const topic = metadata?.topic || 'Unknown'

      if (!topicMap.has(topic)) {
        topicMap.set(topic, [])
      }

      const daysAgo = (now - attempt.attemptedAt) / (1000 * 60 * 60 * 24)
      const weight = Math.pow(0.5, daysAgo / 7) // Recency decay
      
      topicMap.get(topic).push({
        correctness: attempt.correctness ? 1 : 0,
        weight,
        timeTaken: attempt.timeTakenSeconds,
        confidence: attempt.confidenceRating,
      })
    })

    const topicMastery = Array.from(topicMap.entries()).map(([topic, topicAttempts]) => {
      const totalWeight = topicAttempts.reduce((sum, a) => sum + a.weight, 0)
      
      // Signal 1: Accuracy (60% weight)
      const weightedCorrect = topicAttempts.reduce((sum, a) => sum + (a.correctness * a.weight), 0)
      const accuracy = totalWeight > 0 ? weightedCorrect / totalWeight : 0

      // Signal 2: Speed factor (20% weight)
      // Normalize time: faster = better, penalize unusually slow
      const weightedAvgTime = topicAttempts.reduce((sum, a) => sum + (a.timeTaken * a.weight), 0) / totalWeight
      // Normalize to 0-1 scale (inverse: lower time = higher score)
      // Use percentile-based normalization
      const timePercentile = avgTimeGlobal > 0 
        ? Math.max(0, Math.min(1, 1 - (weightedAvgTime - minTimeGlobal) / (maxTimeGlobal - minTimeGlobal || 1)))
        : 0.5
      const normalizedSpeed = timePercentile

      // Signal 3: Confidence alignment (20% weight)
      // Penalize high confidence when wrong, reward high confidence when right
      let confidenceAlignment = 0
      if (topicAttempts.length > 0) {
        const alignmentScores = topicAttempts.map(a => {
          if (a.correctness) {
            // Correct: higher confidence = better alignment
            return (a.confidence - 1) / 4 // Normalize 1-5 to 0-1
          } else {
            // Incorrect: higher confidence = worse alignment (misconception)
            return 1 - (a.confidence - 1) / 4 // Invert: high confidence when wrong = low score
          }
        })
        confidenceAlignment = topicAttempts.reduce((sum, a, i) => 
          sum + (alignmentScores[i] * a.weight), 0) / totalWeight
      }

      // Combined mastery score
      const mastery_score = (accuracy * 0.6) + (normalizedSpeed * 0.2) + (confidenceAlignment * 0.2)

      // Calculate additional metrics
      const correctCount = topicAttempts.filter(a => a.correctness).length
      const totalAttempts = topicAttempts.length
      const avgTimeRaw = topicAttempts.reduce((sum, a) => sum + a.timeTaken, 0) / totalAttempts
      
      // Confidence gap: high confidence when wrong
      const incorrectAttempts = topicAttempts.filter(a => !a.correctness)
      const highConfidenceIncorrect = incorrectAttempts.filter(a => a.confidence >= 4).length
      const confidenceGap = incorrectAttempts.length > 0 
        ? (highConfidenceIncorrect / incorrectAttempts.length) > 0.3 ? 'high' : 'low'
        : 'low'

      return {
        topic,
        mastery: Math.round(mastery_score * 1000) / 10, // 0-100 scale
        accuracy: Math.round(accuracy * 1000) / 10,
        avg_time: Math.round(avgTimeRaw),
        confidence_gap: confidenceGap,
        attempts: totalAttempts,
      }
    }).sort((a, b) => a.topic.localeCompare(b.topic))

    res.json({ success: true, error: null, data: topicMastery })
  } catch (error) {
    console.error('Error fetching topic mastery:', error)
    res.status(500).json({ success: false, error: error.message, data: [] })
  }
})

// Attempts endpoints
app.get('/api/attempts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { limit = 50 } = req.query

    const attempts = await prisma.questionAttempt.findMany({
      where: { userId },
      orderBy: { attemptedAt: 'desc' },
      take: parseInt(limit),
      include: {
        testSession: {
          select: {
            testName: true,
            testDate: true,
            examType: true,
            source: true,
          },
        },
      },
    })

    res.json({ success: true, error: null, data: attempts })
  } catch (error) {
    console.error('Error fetching attempts:', error)
    res.status(500).json({ success: false, error: error.message, data: [] })
  }
})

// Attempt history endpoint - groups by test and shows trends
app.get('/api/attempt-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    // Get all test sessions with their attempts
    const testSessions = await prisma.testSession.findMany({
      where: { userId },
      include: {
        attempts: true,
      },
      orderBy: { testDate: 'desc' },
    })

    const history = testSessions.map(session => {
      const attempts = session.attempts
      const correctCount = attempts.filter(a => a.correctness).length
      const accuracy = attempts.length > 0 ? (correctCount / attempts.length) * 100 : 0
      const avgTime = attempts.length > 0
        ? attempts.reduce((sum, a) => sum + a.timeTakenSeconds, 0) / attempts.length
        : 0

      // Group by topic for this test
      const topicMap = new Map()
      attempts.forEach(attempt => {
        const topic = attempt.questionMetadata?.topic || 'Unknown'
        if (!topicMap.has(topic)) {
          topicMap.set(topic, { total: 0, correct: 0 })
        }
        topicMap.get(topic).total++
        if (attempt.correctness) {
          topicMap.get(topic).correct++
        }
      })

      const topics = Array.from(topicMap.entries()).map(([topic, data]) => ({
        topic,
        accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
        attempts: data.total,
      }))

      return {
        test: session.testName,
        testDate: session.testDate,
        accuracy: Math.round(accuracy * 10) / 10,
        avg_time: Math.round(avgTime),
        totalQuestions: session.totalQuestions,
        overallScore: session.overallScore ? Math.round(session.overallScore * 10) / 10 : null,
        topics,
      }
    })

    // Calculate trends
    if (history.length >= 2) {
      const recent = history[0]
      const previous = history[1]
      const trend = {
        accuracyChange: recent.accuracy - previous.accuracy,
        timeChange: recent.avg_time - previous.avg_time,
        direction: recent.accuracy > previous.accuracy ? 'improving' : 'declining',
      }
      history[0].trend = trend
    }

    res.json({ success: true, error: null, data: history })
  } catch (error) {
    console.error('Error fetching attempt history:', error)
    res.status(500).json({ success: false, error: error.message, data: [] })
  }
})

app.post('/api/attempts/bulk', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { attempts } = req.body
    if (!Array.isArray(attempts) || attempts.length === 0) {
      return res.status(400).json({ success: false, error: 'No attempts provided', data: null })
    }

    const rows = attempts.map(row => ({
      userId,
      questionMetadata: row.question_metadata || row.questionMetadata || {},
      correctness: row.correctness ?? false,
      confidenceRating: row.confidence_rating || row.confidenceRating || 3,
      timeTakenSeconds: row.time_taken_seconds || row.timeTakenSeconds || 0,
      mistakeType: row.mistake_type || row.mistakeType || null,
      testSessionId: row.test_session_id || row.testSessionId || null,
      attemptedAt: row.attempted_at ? new Date(row.attempted_at) : new Date(),
    }))

    const result = await prisma.questionAttempt.createMany({
      data: rows,
      skipDuplicates: true,
    })

    // NOTE: Do NOT trigger recommendations here.
    // Recommendations are ONLY generated after successful uploads via /api/upload-test
    // This endpoint is for backward compatibility only.

    res.json({ success: true, error: null, data: { count: result.count } })
  } catch (error) {
    console.error('Error creating bulk attempts:', error)
    res.status(500).json({ success: false, error: error.message, data: null })
  }
})

app.post('/admin/recompute-recommendations', authenticateToken, async (req, res) => {
  try {
    const adminKey = process.env.ADMIN_API_KEY
    if (adminKey && req.headers['x-admin-key'] !== adminKey) {
      return res.status(403).json({ success: false, error: 'Invalid admin key', data: null })
    }
    const { userId, recomputeAll } = req.body || {}

    if (recomputeAll) {
      return res.json({ 
        success: true, 
        error: null, 
        data: { message: 'Recommendations are now computed via API endpoints' } 
      })
    }

    const targetUserId = userId || req.user.id

    res.json({
      success: true,
      error: null,
      data: { userId: targetUserId, message: 'Use GET /api/recommendations/:examType to fetch recommendations' },
    })
  } catch (error) {
    console.error('Error recomputing recommendations:', error)
    res.status(500).json({ success: false, error: error.message, data: null })
  }
})

app.patch('/api/recommendations/:id/follow', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const recommendation = await prisma.recommendation.update({
      where: { id },
      data: {
        followed: true,
        followedAt: new Date(),
      },
    })

    res.json({ success: true, error: null, data: recommendation })
  } catch (error) {
    console.error('Error marking recommendation as followed:', error)
    res.status(500).json({ success: false, error: error.message, data: null })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
