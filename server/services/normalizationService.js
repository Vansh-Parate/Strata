import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const ALLOWED_SUBJECTS = [
  'Mathematics',
  'Verbal',
  'Physics',
  'Chemistry',
  'Biology',
  'General',
]

const SUBJECT_ALIAS_RULES = [
  { subject: 'Mathematics', patterns: [/math/i, /quant/i, /algebra/i, /geometry/i, /calc/i, /trig/i, /arithmetic/i, /number/i] },
  { subject: 'Verbal', patterns: [/verbal/i, /english/i, /reading/i, /grammar/i, /vocab/i, /comprehension/i, /\brc\b/i, /language/i] },
  { subject: 'Physics', patterns: [/physics/i] },
  { subject: 'Chemistry', patterns: [/chem/i] },
  { subject: 'Biology', patterns: [/bio/i] },
]

const NULL_TOPIC_VALUES = new Set(['', 'n/a', 'na', 'none', 'unknown', 'null', '-'])

const TOPIC_ALIASES = {
  'probability & statistics': 'Probability and Statistics',
  'probability and statistics': 'Probability and Statistics',
  'probability/statistics': 'Probability and Statistics',
  'statistics and probability': 'Probability and Statistics',
  'probability & stats': 'Probability and Statistics',
  'probability and stats': 'Probability and Statistics',
  'data interpretation': 'Data Interpretation',
  'data analysis': 'Data Interpretation',
  'reading comprehension': 'Reading Comprehension',
  'critical reasoning': 'Critical Reasoning',
  'sentence correction': 'Sentence Correction',
  'number theory': 'Number Theory',
  'coordinate geometry': 'Coordinate Geometry',
  'word problems': 'Word Problems',
  'word problem': 'Word Problems',
}

const TITLE_CASE_EXCEPTIONS = new Set(['and', 'or', 'of', 'the', 'to', 'in', 'on', 'for', 'with'])

function toTitleCase(input) {
  const words = input.split(' ')
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && TITLE_CASE_EXCEPTIONS.has(lower)) {
        return lower
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

export function normalizeSubject(rawSubject) {
  if (!rawSubject) return 'General'
  const cleaned = String(rawSubject).trim()
  if (!cleaned) return 'General'

  const exact = ALLOWED_SUBJECTS.find(s => s.toLowerCase() === cleaned.toLowerCase())
  if (exact) return exact

  for (const rule of SUBJECT_ALIAS_RULES) {
    if (rule.patterns.some(pattern => pattern.test(cleaned))) {
      return rule.subject
    }
  }

  return 'General'
}

export function resolveSubject(attempt) {
  const metadata = (attempt.questionMetadata && typeof attempt.questionMetadata === 'object' && !Array.isArray(attempt.questionMetadata))
    ? attempt.questionMetadata
    : {}

  const candidate =
    metadata.subject ||
    attempt.testSession?.examType ||
    attempt.testSession?.testName ||
    null

  return normalizeSubject(candidate)
}

export function normalizeTopic(rawTopic) {
  if (!rawTopic) return null
  let cleaned = String(rawTopic).trim()
  if (!cleaned) return null

  cleaned = cleaned.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const lower = cleaned.toLowerCase()

  if (NULL_TOPIC_VALUES.has(lower)) return null

  const aliasKey = lower.replace(/&/g, 'and')
  if (TOPIC_ALIASES[aliasKey]) {
    return TOPIC_ALIASES[aliasKey]
  }

  return toTitleCase(cleaned)
}

function inferMistakeType(attempt, avgTimeSeconds) {
  if (attempt.correctness) return null
  const confidence = Number(attempt.confidenceRating)
  const timeTaken = Number(attempt.timeTakenSeconds)

  if (confidence >= 4) return 'conceptual'
  if (confidence <= 2) return 'guess'
  if (Number.isFinite(avgTimeSeconds) && timeTaken > avgTimeSeconds) return 'misread'

  return null
}

export async function normalizeAttemptsForUser(userId) {
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    include: { testSession: true },
  })

  if (attempts.length === 0) {
    return {
      updatedCount: 0,
      inferredMistakeCount: 0,
      normalizedCount: 0,
    }
  }

  const resolvedSubjects = attempts.map(resolveSubject)
  const timeStatsBySubject = new Map()
  let totalTime = 0
  let totalCount = 0

  attempts.forEach((attempt, index) => {
    const subject = resolvedSubjects[index]
    const time = Number(attempt.timeTakenSeconds)
    if (!Number.isFinite(time)) return

    const current = timeStatsBySubject.get(subject) || { sum: 0, count: 0 }
    current.sum += time
    current.count += 1
    timeStatsBySubject.set(subject, current)

    totalTime += time
    totalCount += 1
  })

  const avgTimeBySubject = new Map(
    Array.from(timeStatsBySubject.entries()).map(([subject, stats]) => [
      subject,
      stats.count > 0 ? stats.sum / stats.count : null,
    ])
  )
  const overallAvgTime = totalCount > 0 ? totalTime / totalCount : null

  const updates = []
  let inferredMistakeCount = 0
  let normalizedCount = 0

  attempts.forEach((attempt, index) => {
    const metadata =
      attempt.questionMetadata && typeof attempt.questionMetadata === 'object' && !Array.isArray(attempt.questionMetadata)
        ? { ...attempt.questionMetadata }
        : {}

    const normalizedSubject = resolvedSubjects[index]
    const normalizedTopic = normalizeTopic(metadata.topic)

    let metadataChanged = false

    if (normalizedSubject && metadata.subject !== normalizedSubject) {
      metadata.subject = normalizedSubject
      metadataChanged = true
    }

    if (normalizedTopic !== null && metadata.topic !== normalizedTopic) {
      metadata.topic = normalizedTopic
      metadataChanged = true
    }

    if (normalizedTopic === null && metadata.topic && NULL_TOPIC_VALUES.has(String(metadata.topic).trim().toLowerCase())) {
      metadata.topic = null
      metadataChanged = true
    }

    let inferredMistake = null
    if (!attempt.mistakeType) {
      inferredMistake = inferMistakeType(
        attempt,
        avgTimeBySubject.get(normalizedSubject) ?? overallAvgTime
      )
    }

    if (metadataChanged || inferredMistake) {
      updates.push({
        id: attempt.id,
        questionMetadata: metadata,
        mistakeType: inferredMistake,
      })
      if (inferredMistake) inferredMistakeCount += 1
      if (metadataChanged) normalizedCount += 1
    }
  })

  const chunkSize = 100
  let updatedCount = 0

  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize)
    await prisma.$transaction(
      chunk.map(update =>
        prisma.questionAttempt.update({
          where: { id: update.id },
          data: {
            questionMetadata: update.questionMetadata,
            ...(update.mistakeType ? { mistakeType: update.mistakeType } : {}),
          },
        })
      )
    )
    updatedCount += chunk.length
  }

  return { updatedCount, inferredMistakeCount, normalizedCount }
}
