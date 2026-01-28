/**
 * RECOMMENDATIONS ROUTES
 * 
 * GET /api/recommendations
 * - Fetch recommendations for user's active exam type
 * 
 * GET /api/recommendations/:examType
 * - Fetch current recommendations for specific exam
 * - Return cards (if any) for frontend to render
 * 
 * POST /api/recommendations/:examType/regenerate
 * - Trigger recommendation regeneration
 * - Called after test upload or on-demand
 * - Returns updated recommendation
 */

import express from 'express'
import { PrismaClient } from '@prisma/client'
import { generateRecommendationsForUser, getRecommendations } from '../services/recommendationService.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()
const prisma = new PrismaClient()

/**
 * GET /api/recommendations
 * Fetch recommendations for user's active exam type
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    // Get user's active exam type
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeExamType: true },
    })

    if (!user?.activeExamType) {
      return res.json({
        success: true,
        data: null,
      })
    }

    const recommendations = await getRecommendations(userId, user.activeExamType)

    res.json({
      success: true,
      data: recommendations,
    })
  } catch (error) {
    console.error('[RECOMMENDATIONS] GET root error:', error.message)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * GET /api/recommendations/:examType
 * Fetch current recommendations for specific exam
 */
router.get('/:examType', authenticateToken, async (req, res) => {
  try {
    const { examType } = req.params
    const userId = req.user.id

    const recommendations = await getRecommendations(userId, examType)

    res.json({
      success: true,
      data: recommendations,
    })
  } catch (error) {
    console.error('[RECOMMENDATIONS] GET error:', error.message)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * POST /api/recommendations/:examType/regenerate
 * Trigger recommendation regeneration
 */
router.post('/:examType/regenerate', authenticateToken, async (req, res) => {
  try {
    const { examType } = req.params
    const userId = req.user.id

    console.log(`[RECOMMENDATIONS] Regenerate request for ${userId} / ${examType}`)

    const recommendations = await generateRecommendationsForUser(userId, examType)

    res.json({
      success: true,
      data: recommendations,
    })
  } catch (error) {
    console.error('[RECOMMENDATIONS] POST error:', error.message)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

export default router
