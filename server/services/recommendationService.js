/**
 * RECOMMENDATION SERVICE
 * 
 * Node.js responsibilities ONLY:
 * 1. Aggregate metrics (numbers only)
 * 2. Format data for Gemini
 * 3. Call Gemini
 * 4. Validate JSON
 * 5. Persist and return
 * 
 * NO text generation. NO priority logic. NO action templates.
 */

import { PrismaClient } from '@prisma/client'
import { generateRecommendationCards } from './geminiRecommendations.js'

const prisma = new PrismaClient()

/**
 * RESOLVE SUBJECT FROM METADATA
 * 
 * CSV structure: topic (high-level) + subtopic (detailed)
 * Target structure: subject (high-level) + topic (detailed)
 * 
 * For JEE: Physics, Chemistry, Mathematics
 * For NEET: Physics, Chemistry, Biology
 * For CAT: Quant, LRDI, VARC
 * For UPSC: GS1, GS2, GS3, etc.
 */
function resolveSubjectAndTopic(metadata) {
  if (!metadata) return { subject: null, topic: 'Unknown' }

  const csvTopic = String(metadata.topic || '').trim()
  const csvSubtopic = String(metadata.subtopic || '').trim()

  // List of valid subject names across all exams
  const validSubjects = [
    'Physics', 'Chemistry', 'Mathematics', 'Biology',
    'Quant', 'LRDI', 'VARC',
    'GS1', 'GS2', 'GS3', 'GS4', 'GS5', 'GS6',
  ]

  // If topic (high-level) is a valid subject, use it as subject
  if (validSubjects.includes(csvTopic)) {
    return {
      subject: csvTopic,
      topic: csvSubtopic || csvTopic, // Use subtopic if available, else topic itself
    }
  }

  // Try to infer subject from topic string
  const topicLower = csvTopic.toLowerCase()
  
  // Physics keywords
  if (/mechanics|thermodynamics|optics|waves|electricity|electromagnetism|modern physics|relativity|motion|force|energy|momentum/.test(topicLower)) {
    return { subject: 'Physics', topic: csvTopic }
  }
  
  // Chemistry keywords
  if (/chemistry|organic|inorganic|physical|stoichiometry|equilibrium|kinetics|redox|acid|base|salt|bonding|molecular|mole|concentration|solution/.test(topicLower)) {
    return { subject: 'Chemistry', topic: csvTopic }
  }
  
  // Mathematics keywords
  if (/algebra|geometry|trigonometry|calculus|differentiation|integration|matrices|determinant|vector|sequence|series|probability|statistics|complex|logarithm|exponential|function|equation/.test(topicLower)) {
    return { subject: 'Mathematics', topic: csvTopic }
  }
  
  // Biology keywords (NEET)
  if (/biology|botany|zoology|genetics|evolution|ecology|cell|organism|dna|enzyme|photosynthesis|respiration|anatomy|physiology/.test(topicLower)) {
    return { subject: 'Biology', topic: csvTopic }
  }

  // If we couldn't determine subject, use null and log warning
  console.warn(`[AGGREGATION] Could not resolve subject from topic: "${csvTopic}", subtopic: "${csvSubtopic}"`)
  return { subject: null, topic: csvTopic || 'Unknown' }
}

/**
 * Aggregate performance metrics per subject-topic
 * Returns numeric metrics only - NO text generation
 */
function aggregatePerformanceMetrics(testSessions) {
  const allAttempts = testSessions.flatMap(s => s.attempts || [])
  const attemptsBySubjectTopic = {}

  allAttempts.forEach(attempt => {
    const metadata = attempt.questionMetadata || {}
    const { subject, topic } = resolveSubjectAndTopic(metadata)
    const key = subject ? `${subject}|${topic}` : `null|${topic}`

    if (!attemptsBySubjectTopic[key]) {
      attemptsBySubjectTopic[key] = {
        subject,
        topic,
        attempts: [],
        testIds: new Set()
      }
    }

    attemptsBySubjectTopic[key].attempts.push(attempt)
    if (attempt.testSessionId) {
      attemptsBySubjectTopic[key].testIds.add(attempt.testSessionId)
    }
  })

  const aggregatedData = []

  for (const [key, data] of Object.entries(attemptsBySubjectTopic)) {
    const attempts = data.attempts
    if (attempts.length < 3) continue

    const total = attempts.length
    const correct = attempts.filter(a => a.correctness).length
    const incorrect = total - correct
    const incorrectRate = incorrect / total

    let confidenceMismatch = 0
    attempts.forEach(attempt => {
      const conf = attempt.confidenceRating || 0
      if (conf >= 4 && !attempt.correctness) {
        confidenceMismatch++
      }
    })
    const confidenceMismatchRate = confidenceMismatch / total

    const testIds = Array.from(data.testIds)
    const testCount = testIds.length

    const attemptsByTest = {}
    attempts.forEach(attempt => {
      const testId = attempt.testSessionId || 'unknown'
      if (!attemptsByTest[testId]) {
        attemptsByTest[testId] = { total: 0, correct: 0 }
      }
      attemptsByTest[testId].total++
      if (attempt.correctness) attemptsByTest[testId].correct++
    })

    const accuraciesByTest = Object.values(attemptsByTest)
      .map(d => d.total > 0 ? d.correct / d.total : 0)

    let volatility = 0
    let trend = 'stable'
    let hasRegression = false

    if (accuraciesByTest.length >= 2) {
      const avg = accuraciesByTest.reduce((a, b) => a + b, 0) / accuraciesByTest.length
      const variance = accuraciesByTest.reduce((sum, acc) => sum + Math.pow(acc - avg, 2), 0) / accuraciesByTest.length
      volatility = Math.sqrt(variance)

      const mid = Math.ceil(accuraciesByTest.length / 2)
      const firstHalf = accuraciesByTest.slice(0, mid)
      const secondHalf = accuraciesByTest.slice(mid)

      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      const diff = secondAvg - firstAvg

      if (Math.abs(diff) < 0.1) {
        trend = 'stable'
      } else if (diff > 0.1) {
        trend = 'improving'
      } else {
        trend = 'declining'
      }

      if (firstAvg >= 0.60 && secondAvg < firstAvg - 0.15) {
        hasRegression = true
      }
    }

    aggregatedData.push({
      subject: data.subject || null,
      topic: data.topic,
      attempts: total,
      incorrect_rate: Math.round(incorrectRate * 1000) / 1000,
      confidence_mismatch_rate: Math.round(confidenceMismatchRate * 1000) / 1000,
      volatility: Math.round(volatility * 1000) / 1000,
      trend,
      last_seen_test_index: testCount - 1,
      dataPoints: total
    })
  }

  return aggregatedData
}

/**
 * Generate recommendations for user + exam type
 */
export async function generateRecommendationsForUser(userId, examType) {
  if (!userId || !examType) {
    throw new Error('userId and examType required')
  }

  console.log(`[RECOMMENDATION] Starting for ${userId} / ${examType}`)

  const testSessions = await prisma.testSession.findMany({
    where: { userId, examType },
    orderBy: { testDate: 'asc' },
    include: {
      attempts: {
        select: {
          id: true,
          correctness: true,
          confidenceRating: true,
          questionMetadata: true,
          testSessionId: true,
        },
      },
    },
  })

  if (testSessions.length === 0) {
    console.log(`[RECOMMENDATION] No tests found`)
    await prisma.recommendation.deleteMany({
      where: { userId, examType },
    })
    return null
  }

  const aggregatedData = aggregatePerformanceMetrics(testSessions)
  console.log(`[RECOMMENDATION] Aggregated ${aggregatedData.length} subject-topic combinations`)

  // CRITICAL: Validate that no null subjects reach Gemini
  const nullSubjectCount = aggregatedData.filter(d => d.subject === null).length
  if (nullSubjectCount > 0) {
    console.warn(`[RECOMMENDATION] ⚠️ WARNING: ${nullSubjectCount} entries have null subject - these will be skipped`)
    console.warn(`[RECOMMENDATION] Null subject entries:`, aggregatedData.filter(d => d.subject === null).map(d => d.topic))
  }
  
  // Filter out null subjects before sending to Gemini
  const validAggregatedData = aggregatedData.filter(d => d.subject !== null)
  
  if (validAggregatedData.length === 0) {
    console.log(`[RECOMMENDATION] No valid aggregated data after filtering null subjects`)
    return null
  }

  const previousRecommendation = await prisma.recommendation.findUnique({
    where: {
      userId_examType: { userId, examType },
    },
    select: { cards: true },
  })

  const previousCards = previousRecommendation?.cards || []

  const geminiInput = {
    exam_type: examType,
    aggregated_performance_data: validAggregatedData,
    previous_recommendation_cards: previousCards
  }

  console.log(`[RECOMMENDATION] Gemini input (after null subject filter):`)
  console.log(`  - Exam: ${examType}`)
  console.log(`  - Valid aggregated topics: ${validAggregatedData.length}`)
  console.log(`  - Data: ${JSON.stringify(validAggregatedData, null, 2).substring(0, 500)}...`)
  console.log(`  - Previous cards: ${previousCards.length}`)

  const result = await generateRecommendationCards(geminiInput)

  console.log(`[RECOMMENDATION] Gemini returned:`)
  console.log(`  - Status: ${result.status}`)
  console.log(`  - Cards: ${result.cards.length}`)
  if (result.cards.length > 0) {
    console.log(`  - Cards JSON: ${JSON.stringify(result.cards, null, 2).substring(0, 800)}...`)
  }

  const recommendation = await prisma.recommendation.upsert({
    where: {
      userId_examType: { userId, examType },
    },
    create: {
      userId,
      examType,
      cards: result.cards,
      status: result.status,
      evidence: {
        dataPointCount: aggregatedData.length,
        testCount: testSessions.length,
      },
    },
    update: {
      cards: result.cards,
      status: result.status,
      evidence: {
        dataPointCount: aggregatedData.length,
        testCount: testSessions.length,
      },
    },
  })

  console.log(`[RECOMMENDATION] Persisted recommendation for ${examType}:`)
  console.log(`  - ID: ${recommendation.id}`)
  console.log(`  - Cards stored: ${recommendation.cards.length}`)
  return recommendation
}

/**
 * Fetch current recommendations for user + exam
 */
export async function getRecommendations(userId, examType) {
  if (!userId || !examType) {
    return null
  }

  const rec = await prisma.recommendation.findUnique({
    where: {
      userId_examType: { userId, examType },
    },
  })

  return rec
}
