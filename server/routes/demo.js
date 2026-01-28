import express from 'express'
import { PrismaClient } from '@prisma/client'

const router = express.Router()
const prisma = new PrismaClient()

const topics = [
  'Algebra',
  'Geometry',
  'Number Theory',
  'Probability',
  'Statistics',
  'Trigonometry',
  'Calculus',
  'Reading Comprehension',
  'Grammar',
  'Vocabulary',
]

const subtopics = {
  Algebra: ['Linear Equations', 'Quadratic Equations', 'Polynomials', 'Inequalities'],
  Geometry: ['Triangles', 'Circles', 'Coordinate Geometry', '3D Shapes'],
  'Number Theory': ['Prime Numbers', 'Divisibility', 'Modular Arithmetic'],
  Probability: ['Basic Probability', 'Conditional Probability', 'Bayes Theorem'],
  Statistics: ['Mean/Median/Mode', 'Standard Deviation', 'Distributions'],
  Trigonometry: ['Sine/Cosine', 'Identities', 'Inverse Functions'],
  Calculus: ['Derivatives', 'Integrals', 'Limits'],
  'Reading Comprehension': ['Main Idea', 'Inference', 'Detail Questions'],
  Grammar: ['Tenses', 'Subject-Verb Agreement', 'Modifiers'],
  Vocabulary: ['Synonyms', 'Antonyms', 'Context Clues'],
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)]
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function getRandomFloat(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10
}

function generateQuestionMetadata(topic) {
  const subtopic = getRandomElement(subtopics[topic] || ['General'])
  const skills = []
  if (Math.random() > 0.5) skills.push('word_problem')
  if (Math.random() > 0.5) skills.push('multi_step')
  if (Math.random() > 0.5) skills.push('application')

  return {
    topic,
    subtopic,
    difficulty: getRandomInt(1, 5),
    skills_tags: skills.length > 0 ? skills : ['basic'],
  }
}

function generateAttempts(userId, testSessionId, count, baseDate) {
  const attempts = []
  const topicDistribution = topics.map(t => ({ topic: t, weight: Math.random() }))
  topicDistribution.sort((a, b) => b.weight - a.weight)

  for (let i = 0; i < count; i++) {
    const topic = topicDistribution[i % topicDistribution.length].topic
    const metadata = generateQuestionMetadata(topic)
    
    const topicIndex = topics.indexOf(topic)
    const baseAccuracy = 0.4 + (topicIndex % 3) * 0.2 + Math.random() * 0.2
    const isCorrect = Math.random() < baseAccuracy
    
    const confidenceRating = isCorrect ? getRandomInt(3, 5) : getRandomInt(1, 3)
    const timeTakenSeconds = getRandomInt(30, 300)
    
    let mistakeType = null
    if (!isCorrect) {
      const mistakeTypes = ['conceptual', 'calculation', 'misread', 'guess']
      mistakeType = getRandomElement(mistakeTypes)
    }

    const attemptedAt = new Date(baseDate)
    attemptedAt.setMinutes(attemptedAt.getMinutes() + i * 2)

    attempts.push({
      userId,
      testSessionId,
      questionMetadata: metadata,
      correctness: isCorrect,
      confidenceRating,
      timeTakenSeconds,
      mistakeType,
      attemptedAt,
    })
  }

  return attempts
}

// Generate new demo test session
router.post('/api/demo/generate-test', async (req, res) => {
  try {
    const { user_id: userId, questions = 30 } = req.body

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing user_id', data: null })
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found', data: null })
    }

    const testDate = new Date()
    const attempts = generateAttempts(userId, null, questions, testDate)

    // Calculate session stats
    const correctCount = attempts.filter(a => a.correctness).length
    const overallScore = (correctCount / questions) * 100
    const totalTime = attempts.reduce((sum, a) => sum + a.timeTakenSeconds, 0)

    // Create test session
    const session = await prisma.testSession.create({
      data: {
        userId,
        testName: `Demo Test ${new Date().toLocaleDateString()}`,
        testDate,
        overallScore: Math.round(overallScore * 10) / 10,
        totalQuestions: questions,
        totalTime,
      },
    })

    // Create attempts with session ID
    await prisma.questionAttempt.createMany({
      data: attempts.map(a => ({ ...a, testSessionId: session.id })),
    })

    try {
      console.log('[DEMO] Demo test created, recommendations will be recomputed via API')
    } catch (recError) {
      console.error('Error in demo:', recError)
    }

    res.json({
      success: true,
      error: null,
      data: {
        sessionId: session.id,
        overallScore: session.overallScore,
        totalQuestions: session.totalQuestions,
        correctCount,
        totalTime: session.totalTime,
        message: `Generated ${questions} question attempts for test session`,
      },
    })
  } catch (error) {
    console.error('Error generating demo test:', error)
    res.status(500).json({ success: false, error: error.message, data: null })
  }
})

export default router
