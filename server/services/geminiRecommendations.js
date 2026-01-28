/**
 * GEMINI RECOMMENDATION ENGINE
 * 
 * Node.js responsibilities:
 * - Aggregate metrics (numbers only)
 * - Pass structured data to Gemini
 * - Validate Gemini JSON
 * - Return response as-is
 * 
 * Gemini responsibilities:
 * - Generate priority
 * - Generate confidence
 * - Generate why text
 * - Generate action steps
 * - All subject-specific logic
 */

let genAI = null

if (process.env.GOOGLE_GEMINI_API_KEY) {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
    console.log('[GEMINI] Initialized')
  } catch (error) {
    console.warn('[GEMINI] Init failed:', error.message)
  }
}

/**
 * Generate a SINGLE recommendation card using Gemini
 * 
 * @param {Object} input
 * @param {string} input.exam_type - JEE | NEET | CAT | UPSC
 * @param {string} input.subject - Physics, Chemistry, Mathematics, Biology, etc.
 * @param {string} input.topic - Topic name from data
 * @param {number} input.incorrect_rate - 0-1
 * @param {number} input.confidence_mismatch_rate - 0-1
 * @param {number} input.volatility - 0-1
 * @param {string} input.trend - improving | declining | unstable | stable
 * @param {number} input.dataPoints - Number of attempts
 * @returns {Promise<Object>} Single card object { priority, subject, topic, confidence, dataPoints, why, actions }
 */
export async function generateSingleCard(input) {
  if (!genAI) {
    throw new Error('Gemini not initialized')
  }

  if (!input || !input.exam_type || !input.subject || !input.topic) {
    return null
  }

  const { exam_type: examType, subject, topic, incorrect_rate: incorrectRate, 
          confidence_mismatch_rate: confidenceMismatchRate, volatility, trend, dataPoints } = input

  const prompt = `You are generating ONE recommendation card.

CRITICAL RULES (ABSOLUTE):
- Output MUST be a SINGLE valid JSON object
- NO markdown
- NO explanations
- NO comments
- NO trailing commas
- NO unfinished strings
- NO line breaks inside strings
- KEEP EVERY STRING UNDER 120 CHARACTERS
- If you cannot finish the JSON completely, OUTPUT: {"__error":"TRUNCATION"}

DO NOT output anything else.

FIELDS YOU MUST OUTPUT:
priority, subject, topic, confidence, dataPoints, why, actions

STRICT CONSTRAINTS:
- "why" MUST be <= 100 characters
- Each action MUST be <= 80 characters
- actions MUST be an array of EXACTLY 3 strings
- Do NOT repeat verbs across actions
- Do NOT use generic phrases (no "revise", "practice more", "analyze errors")

PRIORITY RULE (MANDATORY):
HIGH if incorrect_rate >= 0.45 OR confidence_mismatch_rate >= 0.40
MEDIUM if incorrect_rate 0.30–0.45
LOW if incorrect_rate < 0.30

CONFIDENCE RULE:
Start at 100.
Subtract 20 if dataPoints < 30.
Subtract 20 if volatility > 0.25.
Subtract 10 if trend is unstable.
Clamp 0–100.

INPUT DATA:
Subject: ${subject}
Topic: ${topic}
incorrect_rate: ${incorrectRate}
confidence_mismatch_rate: ${confidenceMismatchRate}
trend: ${trend}
volatility: ${volatility}
dataPoints: ${dataPoints}

OUTPUT EXACT JSON SHAPE:

{
  "priority": "High|Medium|Low",
  "subject": "${subject}",
  "topic": "${subject}",
  "confidence": <number>,
  "dataPoints": ${dataPoints},
  "why": "<short factual sentence>",
  "actions": [
    "<short action 1>",
    "<short action 2>",
    "<short action 3>"
  ]
}`

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash'
    })

    console.log('[GEMINI_SINGLE] Generating card for', subject, '/', topic)

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0,
        topP: 0.8,
        maxOutputTokens: 2000
      }
    })

    const text = result.response.text().trim()

    console.log('[GEMINI_SINGLE] Raw response:', text.substring(0, 500))

    // Check for incomplete JSON (common with token limit issues)
    if (!text.endsWith('}') || text.length < 100) {
      console.warn("[GEMINI_SINGLE] Response appears incomplete (length:", text.length, ", ends with:", text.slice(-10), ")")
      return null
    }

    if (text.includes("__error")) {
      console.warn("[GEMINI_SINGLE] Truncation signaled, skipping card");
      return null;
    }

    let card
    try {
      card = JSON.parse(text)
    } catch (parseError) {
      console.log('[GEMINI_SINGLE] Direct parse failed, attempting to remove markdown fences...')
      
      let cleanedText = text
      
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '')
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '')
      }
      
      cleanedText = cleanedText.trim()
      
      try {
        card = JSON.parse(cleanedText)
        console.log('[GEMINI_SINGLE] Parsed after removing fences')
      } catch (secondParseError) {
        console.error('[GEMINI_SINGLE] Parse failed even after fence removal')
        console.error('[GEMINI_SINGLE] Text:', text.substring(0, 300))
        return null
      }
    }

    // Validate card structure
    if (!card.priority || !card.subject || !card.topic || typeof card.confidence !== 'number' || !Array.isArray(card.actions)) {
      console.warn('[GEMINI_SINGLE] Invalid card structure:', JSON.stringify(card).substring(0, 200))
      return null
    }

    // Normalize priority case (Gemini sometimes returns "HIGH")
    card.priority = card.priority[0].toUpperCase() + card.priority.slice(1).toLowerCase()

    console.log('[GEMINI_SINGLE] Generated valid card:', subject, '/', topic, 'priority:', card.priority)
    return card
  } catch (error) {
    console.error('[GEMINI_SINGLE] Error:', error.message)
    
    // Strict per-card retry: ONCE only
    if (error.message && (error.message.includes('JSON') || error.message.includes('parse'))) {
      console.log('[GEMINI_SINGLE] Retry ONCE with aggressive token budget...')
      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash'
        })
        
        const retryResult = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0,
            topP: 0.8,
            maxOutputTokens: 2000
          }
        })
        
        const retryText = retryResult.response.text().trim()
        const retryCard = JSON.parse(retryText)
        
        // Normalize priority case
        retryCard.priority = retryCard.priority[0].toUpperCase() + retryCard.priority.slice(1).toLowerCase()
        
        if (retryCard.priority && retryCard.subject && retryCard.topic && Array.isArray(retryCard.actions)) {
          console.log('[GEMINI_SINGLE] Retry successful')
          return retryCard
        } else {
          console.log('[GEMINI_SINGLE] Retry returned invalid structure, skipping')
          return null
        }
      } catch (retryError) {
        console.log('[GEMINI_SINGLE] Retry failed, logging + skipping:', retryError.message)
        return null
      }
    }
    
    return null
  }
}

/**
 * Generate recommendation cards using Gemini
 * 
 * @param {Object} input
 * @param {string} input.exam_type - JEE | NEET | CAT | UPSC
 * @param {Array} input.aggregated_performance_data - Array of performance metrics
 * @param {Array} input.previous_recommendation_cards - Previous cards to avoid duplicates
 * @returns {Promise<Object>} { status: "OK" | "NO_SIGNIFICANT_PATTERNS", cards: [...] }
 */
export async function generateRecommendationCards(input) {
  if (!genAI) {
    throw new Error('Gemini not initialized')
  }

  if (!input || !input.aggregated_performance_data || !input.exam_type) {
    return { status: 'NO_SIGNIFICANT_PATTERNS', cards: [] }
  }

  const examType = input.exam_type
  const performanceData = input.aggregated_performance_data

  console.log('[GEMINI] Generating cards for', performanceData.length, 'topics')

  const cards = []

  // Generate one card per subject-topic
  for (const data of performanceData) {
    const card = await generateSingleCard({
      exam_type: examType,
      subject: data.subject,
      topic: data.topic,
      incorrect_rate: data.incorrect_rate,
      confidence_mismatch_rate: data.confidence_mismatch_rate,
      volatility: data.volatility,
      trend: data.trend,
      dataPoints: data.dataPoints
    })

    if (card) {
      cards.push(card)
      console.log('[GEMINI] Added card:', data.subject, '/', data.topic)
    } else {
      console.log('[GEMINI] Skipped:', data.subject, '/', data.topic, '(no valid card)')
    }

    // Add delay between consecutive API calls to avoid rate limiting
    if (performanceData.indexOf(data) < performanceData.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log('[GEMINI] Generated', cards.length, 'valid cards')

  return {
    status: cards.length > 0 ? 'OK' : 'NO_SIGNIFICANT_PATTERNS',
    cards
  }
}
