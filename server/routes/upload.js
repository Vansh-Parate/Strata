import express from 'express'
import { PrismaClient } from '@prisma/client'
import Papa from 'papaparse'
import { authenticateToken } from '../middleware/auth.js'
import { generateRecommendationsForUser } from '../services/recommendationService.js'

const router = express.Router()
const prisma = new PrismaClient()

// Parse JSON bodies for this router
router.use(express.json({ limit: '10mb' }))

/**
 * POST /api/upload-test
 * Uploads a CSV file, parses it, and stores attempts in the database
 * 
 * Expected CSV columns:
 * - question_id (string)
 * - topic (string)
 * - subtopic (string, optional)
 * - difficulty (Easy/Medium/Hard)
 * - correct (true/false or 1/0)
 * - time_taken (seconds as integer)
 * - confidence (1-5 integer)
 * - date (YYYY-MM-DD)
 * 
 * Accepts either:
 * 1. FormData with file (multipart/form-data)
 * 2. JSON with csvContent as base64 or string
 */
router.post('/upload-test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { csvContent, testName, testDate, examType, source } = req.body

    console.log('[UPLOAD] Received request for user:', userId)
    console.log('[UPLOAD] Body keys:', Object.keys(req.body))
    console.log('[UPLOAD] csvContent exists:', !!csvContent, 'length:', csvContent?.length || 0)
    console.log('[UPLOAD] Fields: testName=%s, testDate=%s, examType=%s, source=%s', 
      testName, testDate, examType, source)

    if (!csvContent) {
      console.error('[UPLOAD] Missing csvContent')
      return res.status(400).json({
        success: false,
        error: 'No CSV content provided',
        data: null,
      })
    }

    if (!testName || !testDate || !examType || !source) {
      console.error('[UPLOAD] Missing required fields', { testName, testDate, examType, source })
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: testName, testDate, examType, source',
        data: null,
      })
    }

    // Parse CSV file
    const parseResult = await new Promise((resolve, reject) => {
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
        complete: (result) => {
          if (result.errors.length > 0) {
            reject(new Error(`CSV parsing errors: ${result.errors.map(e => e.message).join(', ')}`))
          } else {
            resolve(result)
          }
        },
        error: (error) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`))
        },
      })
    })

    const rows = parseResult.data
    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV file contains no data rows',
        data: null,
      })
    }

    // Check which format the CSV is in and normalize it
    const headers = Object.keys(rows[0] || {})
    const hasNewFormat = ['question_id', 'topic', 'difficulty', 'correct', 'time_taken', 'confidence', 'date'].every(col => headers.includes(col))
    const hasOldFormat = ['userid', 'subject', 'topic', 'correctness', 'confidencerating', 'timetakenseconds', 'mistaketype', 'attemptedat'].every(col => headers.includes(col))
    
    if (!hasNewFormat && !hasOldFormat) {
      const requiredColumns = ['question_id OR userid', 'topic', 'difficulty OR correctness', 'correct OR correctness', 'time_taken OR timetakenseconds', 'confidence OR confidencerating', 'date OR attemptedat']
      return res.status(400).json({
        success: false,
        error: `CSV columns don't match expected format. Found: ${headers.join(', ')}. Expected columns like: question_id/userid, topic, difficulty, correct/correctness, time_taken/timetakenseconds, confidence/confidencerating, date/attemptedat`,
        data: null,
      })
    }

    // Normalize rows if using old format
    const normalizedRows = rows.map(row => {
      if (hasOldFormat) {
        return {
          question_id: row.userid || '',
          topic: row.subject || row.topic || '',
          subtopic: row.topic || '',
          difficulty: 'Medium', // Default for old format
          correct: row.correctness === 'True' || row.correctness === 'true' || row.correctness === true || row.correctness === '1' || row.correctness === 1,
          time_taken: row.timetakenseconds,
          confidence: row.confidencerating || '3',
          date: row.attemptedat ? row.attemptedat.split('T')[0] : '',
          mistaketype: row.mistaketype,
        }
      }
      return row
    })

    console.log('[UPLOAD] CSV format detected: %s', hasNewFormat ? 'new' : 'old (normalized)')
    console.log('[UPLOAD] Sample row after normalization:', normalizedRows[0])

    // Create test session
    const testSession = await prisma.testSession.create({
      data: {
        userId,
        testName,
        testDate: new Date(testDate),
        examType,
        source,
        totalQuestions: rows.length,
        totalTime: rows.reduce((sum, row) => sum + (parseInt(row.time_taken) || 0), 0),
        overallScore: null, // Will be calculated from attempts
      },
    })

    // Validate and transform rows into attempts
    const attempts = []
    const validationErrors = []

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i]
      const rowNum = i + 2 // +2 because row 1 is header, and arrays are 0-indexed

      // Skip empty rows
      if (!row.question_id || !row.topic) {
        continue
      }

      // For old format, we use 'Medium' as default difficulty
      const difficulty = String(row.difficulty || 'Medium').trim()
      if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) {
        validationErrors.push(`Row ${rowNum}: Invalid difficulty "${difficulty}". Must be Easy, Medium, or Hard`)
        continue
      }

      // Validate correct (handle both boolean and string formats)
      const correctValue = String(row.correct).toLowerCase()
      const correct = correctValue === 'true' || correctValue === '1' || row.correct === true || row.correct === 1

      // Validate time_taken
      const timeTaken = parseInt(row.time_taken)
      if (isNaN(timeTaken) || timeTaken < 0) {
        validationErrors.push(`Row ${rowNum}: Invalid time_taken "${row.time_taken}". Must be a non-negative integer`)
        continue
      }

      // Validate confidence (with fallback to 3 for old format)
      const confidence = parseInt(row.confidence) || 3
      if (isNaN(confidence) || confidence < 1 || confidence > 5) {
        validationErrors.push(`Row ${rowNum}: Invalid confidence "${row.confidence}". Must be 1-5`)
        continue
      }

      // Validate date (required)
      const dateStr = String(row.date || '').trim()
      if (!dateStr) {
        validationErrors.push(`Row ${rowNum}: Missing date. Must be YYYY-MM-DD format`)
        continue
      }
      
      let attemptedAt
      try {
        attemptedAt = new Date(dateStr)
        if (isNaN(attemptedAt.getTime())) {
          throw new Error('Invalid date')
        }
      } catch {
        validationErrors.push(`Row ${rowNum}: Invalid date "${dateStr}". Must be YYYY-MM-DD format`)
        continue
      }

      attempts.push({
        userId,
        testSessionId: testSession.id,
        questionMetadata: {
          question_id: String(row.question_id || '').trim(),
          topic: String(row.topic || '').trim(),
          subtopic: String(row.subtopic || '').trim() || null,
          difficulty,
        },
        correctness: correct,
        confidenceRating: confidence,
        timeTakenSeconds: timeTaken,
        mistakeType: row.mistaketype || null,
        attemptedAt,
      })
    }

    if (validationErrors.length > 0 && attempts.length === 0) {
      // All rows failed validation
      await prisma.testSession.delete({ where: { id: testSession.id } })
      return res.status(400).json({
        success: false,
        error: 'All rows failed validation',
        data: { validationErrors },
      })
    }

    // Store attempts in database
    const result = await prisma.questionAttempt.createMany({
      data: attempts,
      skipDuplicates: true,
    })

    // Calculate overall score for test session
    const correctCount = attempts.filter(a => a.correctness).length
    const overallScore = attempts.length > 0 ? (correctCount / attempts.length) * 100 : 0

    await prisma.testSession.update({
      where: { id: testSession.id },
      data: { overallScore },
    })

    // Normalize data and generate recommendations for THIS exam
    try {
      console.log('[UPLOAD] Recommendations will be recomputed via API call')
    } catch (recError) {
      console.error('[UPLOAD] Recommendations error:', recError.message)
    }

    // Update user's active exam type
    await prisma.user.update({
      where: { id: userId },
      data: { activeExamType: examType },
    })
    console.log('[UPLOAD] Set activeExamType=%s for user %s', examType, userId)

    // Trigger recommendation regeneration (async, non-blocking)
    ;(async () => {
      try {
        console.log('[UPLOAD] Triggering recommendation regeneration for', examType)
        await generateRecommendationsForUser(userId, examType)
        console.log('[UPLOAD] Recommendation regeneration complete')
      } catch (error) {
        console.error('[UPLOAD] Recommendation generation failed:', error.message)
      }
    })()

    console.log('[UPLOAD] SUCCESS for user %s: created %d attempts, score=%f, testSessionId=%s',
      userId, result.count, overallScore, testSession.id)

    res.json({
      success: true,
      error: null,
      data: {
        testSessionId: testSession.id,
        attemptsCreated: result.count,
        totalRows: rows.length,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        overallScore: Math.round(overallScore * 10) / 10,
      },
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload and process CSV',
      data: null,
    })
  }
})

export default router
