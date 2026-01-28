/**
 * METRICS AGGREGATION ENGINE — THE CALCULATOR ONLY
 * 
 * Input: Raw test attempts from database
 * Output: Aggregated metrics (numbers only, no text)
 * 
 * Backend ONLY calculates. NO recommendations, NO text decisions.
 * This output feeds directly to Gemini (the brain).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Aggregate all test metrics for an exam type.
 * 
 * Returns structure like:
 * {
 *   examType: "JEE",
 *   testCount: 7,
 *   timeline: [
 *     {date: "2026-01-20", accuracy: 0.42},
 *     {date: "2026-01-21", accuracy: 0.58}
 *   ],
 *   areas: [
 *     {
 *       name: "Physics",
 *       attempts: 420,
 *       incorrectRate: 0.58,
 *       confidenceAvg: 4.1,
 *       trend: "unstable|improving|declining|stable"
 *     }
 *   ]
 * }
 */
export async function aggregateExamMetrics(userId, examType) {
  // Fetch all test sessions for this exam type
  const testSessions = await prisma.testSession.findMany({
    where: {
      userId,
      examType,
    },
    orderBy: { testDate: 'asc' },
    include: {
      attempts: {
        include: {
          user: false,
        },
      },
    },
  })

  if (testSessions.length === 0) {
    return {
      examType,
      testCount: 0,
      timeline: [],
      areas: [],
    }
  }

  // Build timeline: per-test overall accuracy
  const timeline = testSessions.map((session) => {
    const attempts = session.attempts || []
    const correct = attempts.filter((a) => a.correctness).length
    const accuracy = attempts.length > 0 ? correct / attempts.length : 0
    return {
      date: session.testDate.toISOString().split('T')[0],
      accuracy: Math.round(accuracy * 100) / 100,
    }
  })

  // Collect all attempts across all sessions
  const allAttempts = testSessions.flatMap((s) => s.attempts || [])

  // Group by area (extract from questionMetadata.topic)
  const areaMap = new Map()

  allAttempts.forEach((attempt) => {
    // Extract topic from questionMetadata JSON
    const metadata = attempt.questionMetadata || {}
    const areaName = metadata.topic || 'Unknown'

    if (!areaMap.has(areaName)) {
      areaMap.set(areaName, {
        name: areaName,
        attempts: 0,
        correct: 0,
        totalConfidence: 0,
        perTestAccuracy: [],
      })
    }

    const area = areaMap.get(areaName)
    area.attempts += 1
    if (attempt.correctness) area.correct += 1
    area.totalConfidence += attempt.confidenceRating || 0
  })

  // Compute per-test accuracy for each area (for trend analysis)
  testSessions.forEach((session) => {
    const sessionAttempts = session.attempts || []
    const areaSessionMap = new Map()

    sessionAttempts.forEach((attempt) => {
      const metadata = attempt.questionMetadata || {}
      const areaName = metadata.topic || 'Unknown'

      if (!areaSessionMap.has(areaName)) {
        areaSessionMap.set(areaName, { correct: 0, total: 0 })
      }
      const data = areaSessionMap.get(areaName)
      data.total += 1
      if (attempt.correctness) data.correct += 1
    })

    // Record per-test accuracy
    areaSessionMap.forEach((data, areaName) => {
      if (areaMap.has(areaName)) {
        const accuracy = data.total > 0 ? data.correct / data.total : 0
        areaMap.get(areaName).perTestAccuracy.push(accuracy)
      }
    })
  })

  // Compute area metrics and trends
  const areas = Array.from(areaMap.values())
    .filter((a) => a.attempts >= 5) // Only areas with 5+ attempts
    .map((area) => {
      const incorrectRate = 1 - area.correct / area.attempts
      const confidenceAvg = Math.round((area.totalConfidence / area.attempts) * 10) / 10

      // Compute trend from per-test accuracies
      let trend = 'stable'
      if (area.perTestAccuracy.length >= 2) {
        const mid = Math.ceil(area.perTestAccuracy.length / 2)
        const firstHalf = area.perTestAccuracy.slice(0, mid)
        const secondHalf = area.perTestAccuracy.slice(mid)

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
        const diff = secondAvg - firstAvg

        if (Math.abs(diff) < 0.1) {
          trend = 'stable'
        } else if (diff > 0.1) {
          trend = 'improving'
        } else if (diff < -0.1) {
          trend = 'declining'
        } else {
          trend = 'unstable'
        }

        // Check volatility: high variance = unstable
        const avg = area.perTestAccuracy.reduce((a, b) => a + b, 0) / area.perTestAccuracy.length
        const variance = area.perTestAccuracy.reduce((sum, acc) => sum + Math.pow(acc - avg, 2), 0) / area.perTestAccuracy.length
        const stdDev = Math.sqrt(variance)

        if (stdDev > 0.2) {
          trend = 'unstable'
        }
      }

      return {
        name: area.name,
        attempts: area.attempts,
        incorrectRate: Math.round(incorrectRate * 100) / 100,
        confidenceAvg,
        trend,
      }
    })
    .sort((a, b) => b.attempts - a.attempts) // Sort by attempt count

  console.log(`[METRICS] ${examType}: ${testSessions.length} tests, ${areas.length} significant areas`)

  return {
    examType,
    testCount: testSessions.length,
    timeline,
    areas,
  }
}

