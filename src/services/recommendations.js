import { api } from '../lib/apiClient'

/**
 * Fetch test sessions for the authenticated user
 * @returns Promise<{ success: boolean, data: TestSession[] }>
 */
export async function fetchTestSessions() {
  return await api.get('/api/test-sessions')
}

/**
 * Fetch recommendation for user's ACTIVE exam type
 * NEW ARCHITECTURE: Fetches single recommendation object for the user's
 * currently active exam type. No query params needed.
 * @returns Promise<{ success: boolean, data: Recommendation | null }>
 */
export async function fetchExamRecommendations() {
  return await api.get('/api/recommendations')
}

/**
 * LEGACY: Fetch recommendations for a specific test session
 * @deprecated Use fetchExamRecommendations instead
 * @param {string} testSessionId - The test session ID
 * @returns Promise<{ success: boolean, data: Recommendation[] }>
 */
export async function fetchRecommendations(testSessionId) {
  if (!testSessionId) {
    return { success: true, data: [] }
  }
  
  return await api.get('/api/recommendations', { testSessionId })
}
