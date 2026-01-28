import { api } from '../lib/apiClient'

/**
 * Upload a CSV file with test metadata
 * @param {File} file - The CSV file to upload
 * @param {Object} metadata - Test metadata
 * @param {string} metadata.testName - Name of the test
 * @param {Date} metadata.testDate - Date of the test
 * @param {string} metadata.examType - Type of exam (JEE, NEET, etc.)
 * @param {string} metadata.source - Source of the test
 */
export async function uploadTest(file, metadata) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const csvContent = e.target.result
        
        // Format date as YYYY-MM-DD
        const testDate = metadata.testDate instanceof Date
          ? metadata.testDate.toISOString().split('T')[0]
          : metadata.testDate

        console.log('[UPLOAD_SERVICE] Sending request with:', {
          csvContentLength: csvContent.length,
          testName: metadata.testName,
          testDate,
          examType: metadata.examType,
          source: metadata.source,
        })

        const response = await api.post('/api/upload-test', {
          csvContent,
          testName: metadata.testName,
          testDate,
          examType: metadata.examType,
          source: metadata.source,
        })

        console.log('[UPLOAD_SERVICE] Response:', response)
        resolve(response)
      } catch (error) {
        console.error('[UPLOAD_SERVICE] Error:', error)
        reject(error)
      }
    }

    reader.onerror = () => {
      const error = new Error('Failed to read file')
      console.error('[UPLOAD_SERVICE]', error)
      reject(error)
    }

    reader.readAsText(file)
  })
}
