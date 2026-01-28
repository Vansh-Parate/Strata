// API client for backend endpoints
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:6969'

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`
  const token = localStorage.getItem('token') || localStorage.getItem('auth_token')
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }
  
  const config = {
    headers,
    ...options,
  }

  try {
    console.log('[API] %s %s', options.method || 'GET', endpoint)
    if (options.body) {
      console.log('[API] Request body:', JSON.parse(options.body))
    }

    const response = await fetch(url, config)
    const data = await response.json()

    console.log('[API] Response:', response.status, data)

    if (!response.ok) {
      const error = new Error(data.error || 'Request failed')
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    console.error('[API] Error:', error)
    throw error
  }
}

export const api = {
  get: (endpoint, params = {}, options = {}) => {
    const queryString = new URLSearchParams(params).toString()
    const url = queryString ? `${endpoint}?${queryString}` : endpoint
    return apiRequest(url, { method: 'GET', ...options })
  },
  post: (endpoint, body) => {
    return apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  patch: (endpoint, body) => {
    return apiRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
}
