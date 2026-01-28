import { PrismaClient } from '@prisma/client'

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
    
    // Simulate performance: some topics better than others
    const topicIndex = topics.indexOf(topic)
    const baseAccuracy = 0.4 + (topicIndex % 3) * 0.2 + Math.random() * 0.2
    const isCorrect = Math.random() < baseAccuracy
    
    const confidenceRating = isCorrect
      ? getRandomInt(3, 5)
      : getRandomInt(1, 3)
    
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

async function main() {
  console.log('🌱 Starting seed...')

  // Clear existing data
  console.log('🗑️  Clearing existing data...')
  await prisma.questionAttempt.deleteMany()
  await prisma.recommendation.deleteMany()
  await prisma.testSession.deleteMany()
  await prisma.user.deleteMany()

  // Create demo users
  console.log('👤 Creating users...')
  const user1 = await prisma.user.create({
    data: {
      id: 'demo-user-1', // Fixed ID for frontend
      email: 'alex@demo.com',
      name: 'Alex Chen',
      preferences: {
        defaultSubject: 'Math',
        examDate: '2025-06-15',
        notificationSettings: { email: true, push: false },
      },
    },
  })

  const user2 = await prisma.user.create({
    data: {
      email: 'sam@demo.com',
      name: 'Sam Johnson',
      preferences: {
        defaultSubject: 'Verbal',
        examDate: '2025-07-20',
        notificationSettings: { email: true, push: true },
      },
    },
  })

  const user3 = await prisma.user.create({
    data: {
      email: 'jordan@demo.com',
      name: 'Jordan Taylor',
      preferences: {
        defaultSubject: 'Mixed',
        examDate: '2025-08-10',
        notificationSettings: { email: false, push: true },
      },
    },
  })

  console.log(`✅ Created 3 users`)

  // Generate test sessions and attempts for each user
  const users = [user1, user2, user3]
  const now = new Date()

  for (const user of users) {
    console.log(`📊 Generating data for ${user.name}...`)
    
    // Create 4-6 test sessions per user
    const sessionCount = getRandomInt(4, 6)
    const sessions = []

    for (let s = 0; s < sessionCount; s++) {
      const testDate = new Date(now)
      testDate.setDate(testDate.getDate() - (sessionCount - s) * 7) // Spread over weeks

      const questionsPerSession = getRandomInt(25, 50)
      const attempts = generateAttempts(user.id, null, questionsPerSession, testDate)

      // Calculate session stats
      const correctCount = attempts.filter(a => a.correctness).length
      const overallScore = (correctCount / questionsPerSession) * 100
      const totalTime = attempts.reduce((sum, a) => sum + a.timeTakenSeconds, 0)

      const session = await prisma.testSession.create({
        data: {
          userId: user.id,
          testName: `Mock Test ${s + 1}`,
          testDate,
          overallScore: Math.round(overallScore * 10) / 10,
          totalQuestions: questionsPerSession,
          totalTime,
        },
      })

      // Update attempts with session ID
      await prisma.questionAttempt.createMany({
        data: attempts.map(a => ({ ...a, testSessionId: session.id })),
      })

      sessions.push(session)
    }

    // Generate recommendations based on performance patterns
    const allAttempts = await prisma.questionAttempt.findMany({
      where: { userId: user.id },
    })

    // Analyze topic performance
    const topicStats = {}
    allAttempts.forEach(attempt => {
      const topic = attempt.questionMetadata.topic
      if (!topicStats[topic]) {
        topicStats[topic] = { total: 0, correct: 0 }
      }
      topicStats[topic].total++
      if (attempt.correctness) topicStats[topic].correct++
    })

    // Generate 3-5 recommendations
    const recCount = getRandomInt(3, 5)
    const recommendationTemplates = [
      {
        focusArea: 'Probability Fundamentals',
        reasoning: 'You\'ve attempted multiple probability questions with inconsistent results. Focus on understanding basic probability rules and conditional probability concepts.',
        actionSteps: [
          'Review probability formulas and definitions',
          'Practice 10 conditional probability problems',
          'Take a focused quiz on Bayes theorem',
        ],
      },
      {
        focusArea: 'Algebra Word Problems',
        reasoning: 'Your accuracy drops significantly on word problems compared to algebraic equations. Practice translating word problems into equations.',
        actionSteps: [
          'Practice identifying variables in word problems',
          'Work through 15 multi-step word problems',
          'Review common problem-solving strategies',
        ],
      },
      {
        focusArea: 'Reading Comprehension Speed',
        reasoning: 'You show good comprehension but take longer than average. Focus on reading strategies to improve pacing without sacrificing accuracy.',
        actionSteps: [
          'Practice skimming techniques',
          'Time yourself on 5 passages',
          'Focus on main idea identification',
        ],
      },
      {
        focusArea: 'Geometry Proofs',
        reasoning: 'Geometric reasoning questions show conceptual gaps. Strengthen your understanding of geometric properties and relationships.',
        actionSteps: [
          'Review triangle and circle properties',
          'Practice coordinate geometry problems',
          'Work on proof-writing strategies',
        ],
      },
      {
        focusArea: 'Grammar Consistency',
        reasoning: 'Grammar questions show inconsistent performance. Review common rules and practice identifying errors quickly.',
        actionSteps: [
          'Review subject-verb agreement rules',
          'Practice identifying modifier errors',
          'Take timed grammar quizzes',
        ],
      },
    ]

    for (let r = 0; r < recCount; r++) {
      const template = getRandomElement(recommendationTemplates)
      const generatedAt = new Date(now)
      generatedAt.setDate(generatedAt.getDate() - (recCount - r) * 3)

      await prisma.recommendation.create({
        data: {
          userId: user.id,
          subject: template.focusArea.split('→')[0]?.trim() || 'General',
          topic: template.focusArea.split('→')[1]?.trim() || template.focusArea,
          generatedAt,
          focusArea: template.focusArea,
          priority: r === 0 ? 'high' : r === 1 ? 'medium' : 'low',
          reasoning: template.reasoning,
          evidence: {
            recent_attempts: getRandomInt(8, 20),
            accuracy: getRandomFloat(0.3, 0.6),
            avg_confidence: getRandomFloat(2.5, 4.0),
            avg_time_seconds: getRandomInt(120, 300),
            mistake_breakdown: {
              conceptual: getRandomInt(5, 12),
              calculation: getRandomInt(2, 6),
              guess: getRandomInt(1, 3),
            },
            trend: getRandomElement(['improving', 'stable', 'declining']),
          },
          actionSteps: template.actionSteps,
          confidenceScore: getRandomInt(65, 95),
          dataPointCount: getRandomInt(12, 30),
          followed: r > 1, // Mark older ones as followed
          followedAt: r > 1 ? new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000) : null,
          outcomeImproved: r > 1 ? Math.random() > 0.3 : null,
        },
      })
    }

    console.log(`✅ Generated ${sessionCount} sessions and ${recCount} recommendations for ${user.name}`)
  }

  console.log('✨ Seed completed successfully!')
}

main()
  .catch(e => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
