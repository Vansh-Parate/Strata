import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { fetchAttemptHistory } from '../../services/attempts'
import { UploadTestButton } from '../upload/UploadTestButton'

// Breakdown Modal Component
function BreakdownModal({ attempt, onClose, topicAnalysis }) {
  if (!attempt) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blurred Background */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6 space-y-6">
        {/* Header */}
        <div>
          <h3 className="text-lg font-semibold text-[#2C2220]">{attempt.name}</h3>
          <p className="text-sm text-[#8D8A86] mt-1">
            {attempt.date} · Score: {attempt.score}
          </p>
        </div>

        {/* Overall Stats */}
        <div className="bg-[#FFF5F0] rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#78716C]">Correct Answers</span>
            <span className="text-base font-semibold text-[#2C2220]">
              {attempt.correctAnswers}/{attempt.totalQuestions}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#78716C]">Time Taken</span>
            <span className="text-base font-semibold text-[#2C2220]">{attempt.time}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#78716C]">Accuracy</span>
            <span className="text-base font-semibold text-[#2C2220]">{attempt.score}</span>
          </div>
        </div>

        {/* Topic Analysis */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[#2C2220]">Topic Performance</h4>

          {topicAnalysis?.strongestTopic && (
            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex-1">
                <p className="text-xs font-medium text-green-700">Strongest Topic</p>
                <p className="text-sm font-semibold text-[#2C2220]">{topicAnalysis.strongestTopic.name}</p>
                <p className="text-xs text-[#78716C]">{topicAnalysis.strongestTopic.accuracy}% accuracy</p>
              </div>
            </div>
          )}

          {topicAnalysis?.weakestTopic && (
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex-1">
                <p className="text-xs font-medium text-red-700">Weakest Topic</p>
                <p className="text-sm font-semibold text-[#2C2220]">{topicAnalysis.weakestTopic.name}</p>
                <p className="text-xs text-[#78716C]">{topicAnalysis.weakestTopic.accuracy}% accuracy</p>
              </div>
            </div>
          )}

          {topicAnalysis?.mostTimeConsumingTopic && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-700">Most Time Consuming</p>
                <p className="text-sm font-semibold text-[#2C2220]">{topicAnalysis.mostTimeConsumingTopic.name}</p>
                <p className="text-xs text-[#78716C]">{topicAnalysis.mostTimeConsumingTopic.time}s average</p>
              </div>
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-[#E17B5F] text-white rounded-lg font-medium hover:bg-[#d46a4e] transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}


const fallbackAttempts = [
  {
    id: 'mock-12',
    name: 'JEE Main Mock Test 12',
    date: 'Jan 15',
    score: '87%',
    time: '3h 5m',
  },
  {
    id: 'mock-11',
    name: 'JEE Main Mock Test 11',
    date: 'Jan 12',
    score: '83%',
    time: '2h 52m',
  },
  {
    id: 'mock-10',
    name: 'JEE Main Mock Test 10',
    date: 'Jan 9',
    score: '80%',
    time: '2h 58m',
  },
  {
    id: 'mock-9',
    name: 'JEE Main Mock Test 9',
    date: 'Jan 6',
    score: '78%',
    time: '2h 45m',
  },
  {
    id: 'mock-8',
    name: 'JEE Main Mock Test 8',
    date: 'Jan 3',
    score: '75%',
    time: '2h 50m',
  },
  {
    id: 'drill-15',
    name: 'Probability Drill Set 15',
    date: 'Jan 14',
    score: '72%',
    time: '45m',
  },
  {
    id: 'drill-14',
    name: 'Algebra Drill Set 14',
    date: 'Jan 11',
    score: '85%',
    time: '38m',
  },
]


export function AttemptHistory() {
  // Initialize state from localStorage
  const [uploadedFileData, setUploadedFileData] = useState(() => {
    try {
      const storedData = localStorage.getItem('uploadedTestData')
      return storedData ? JSON.parse(storedData) : null
    } catch (error) {
      console.error('Failed to parse stored data:', error)
      localStorage.removeItem('uploadedTestData')
      return null
    }
  })

  const [selectedAttempt, setSelectedAttempt] = useState(null)
  const [topicAnalysis, setTopicAnalysis] = useState(null)

  // Parse CSV and calculate score with topic analysis
  const parseCSVAndCalculateScore = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const csv = event.target.result
          const lines = csv.split('\n')
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
          const correctIndex = headers.indexOf('correct')
          const timeIndex = headers.indexOf('time_taken')
          const topicIndex = headers.indexOf('topic')
          
          let correctCount = 0
          let totalCount = 0
          let totalTimeSeconds = 0
          const topicStats = {} // Track stats by topic
          
          for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue
            
            const values = lines[i].split(',').map(v => v.trim())
            
            const topic = topicIndex !== -1 && values.length > topicIndex 
              ? values[topicIndex] 
              : 'General'
            
            // Initialize topic stats if not exists
            if (!topicStats[topic]) {
              topicStats[topic] = { correct: 0, total: 0, totalTime: 0 }
            }
            
            // Count correct answers
            if (correctIndex !== -1 && values.length > correctIndex) {
              totalCount++
              topicStats[topic].total++
              if (values[correctIndex].toLowerCase() === 'true') {
                correctCount++
                topicStats[topic].correct++
              }
            }
            
            // Sum up time taken
            if (timeIndex !== -1 && values.length > timeIndex) {
              const timeValue = parseFloat(values[timeIndex])
              if (!isNaN(timeValue)) {
                totalTimeSeconds += timeValue
                topicStats[topic].totalTime += timeValue
              }
            }
          }
          
          const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0
          
          // Convert total seconds to hours, minutes, seconds
          const hours = Math.floor(totalTimeSeconds / 3600)
          const minutes = Math.floor((totalTimeSeconds % 3600) / 60)
          const seconds = Math.floor(totalTimeSeconds % 60)
          
          // Format time string
          let timeString = '—'
          if (totalTimeSeconds > 0) {
            const parts = []
            if (hours > 0) parts.push(`${hours}h`)
            if (minutes > 0) parts.push(`${minutes}m`)
            if (seconds > 0) parts.push(`${seconds}s`)
            timeString = parts.length > 0 ? parts.join(' ') : '0s'
          }
          
          // Calculate topic analysis
          let strongestTopic = null
          let weakestTopic = null
          let mostTimeConsumingTopic = null
          let maxAccuracy = -1
          let minAccuracy = 101
          let maxTime = -1
          
          Object.entries(topicStats).forEach(([name, stats]) => {
            const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
            const avgTime = stats.total > 0 ? Math.round(stats.totalTime / stats.total) : 0
            
            if (accuracy > maxAccuracy) {
              maxAccuracy = accuracy
              strongestTopic = { name, accuracy }
            }
            if (accuracy < minAccuracy) {
              minAccuracy = accuracy
              weakestTopic = { name, accuracy }
            }
            if (avgTime > maxTime) {
              maxTime = avgTime
              mostTimeConsumingTopic = { name, time: avgTime }
            }
          })
          
          resolve({ 
            correct: correctCount, 
            total: totalCount, 
            percentage, 
            totalTimeSeconds, 
            timeString,
            topicAnalysis: {
              strongestTopic,
              weakestTopic,
              mostTimeConsumingTopic,
            }
          })
        } catch (error) {
          console.error('Error parsing CSV:', error)
          resolve({ correct: 0, total: 0, percentage: 0, totalTimeSeconds: 0, timeString: '—', topicAnalysis: {} })
        }
      }
      reader.readAsText(file)
    })
  }
  
  const handleFileUpload = async (fileData) => {
    console.log('Uploaded file data:', fileData)
    
    // Parse CSV to get score
    const scoreData = await parseCSVAndCalculateScore(fileData.file)
    
    const enrichedFileData = {
      fileName: fileData.fileName,
      testName: fileData.testName,
      testDate: fileData.testDate,
      examType: fileData.examType,
      source: fileData.source,
      scoreData,
    }
    
    setUploadedFileData(enrichedFileData)
    // Store in localStorage (exclude File object)
    localStorage.setItem('uploadedTestData', JSON.stringify(enrichedFileData))
  }

  const query = useQuery({
    queryKey: ['attempt-history'],
    queryFn: async () => fetchAttemptHistory(),
  })

  const rows =
    query.data?.success && Array.isArray(query.data.data) && query.data.data.length > 0
      ? query.data.data.map((row, index) => ({
          id: row.test ?? row.testDate ?? `row-${index}`,
          name: row.test || 'Test session',
          date: row.testDate
            ? new Date(row.testDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—',
          score: typeof row.overallScore === 'number' ? `${Math.round(row.overallScore)}%` : '—',
          time: typeof row.avg_time === 'number' ? `${Math.round(row.avg_time)}s` : '—',
        }))
      : fallbackAttempts

  // Add uploaded file data to rows
  const allRows = useMemo(() => {
    return uploadedFileData
      ? [
          {
            id: uploadedFileData.fileName.replace('.csv', ''),
            name: uploadedFileData.testName,
            date: uploadedFileData.testDate
              ? new Date(uploadedFileData.testDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : '—',
            score: uploadedFileData.scoreData ? `${uploadedFileData.scoreData.percentage}%` : '—',
            time: uploadedFileData.scoreData?.timeString || '—',
            examType: uploadedFileData.examType,
            source: uploadedFileData.source,
            correctAnswers: uploadedFileData.scoreData ? uploadedFileData.scoreData.correct : 0,
            totalQuestions: uploadedFileData.scoreData ? uploadedFileData.scoreData.total : 0,
            topicAnalysis: uploadedFileData.scoreData?.topicAnalysis || null,
            isNew: true,
          },
          ...rows,
        ]
      : rows
  }, [uploadedFileData, rows])

  // Persisted list of deleted attempt ids so deletions survive reload
  const [deletedAttemptIds, setDeletedAttemptIds] = useState(() => {
    try {
      const raw = localStorage.getItem('deletedAttemptIds')
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  })

  // Compute visible attempts from rows and persisted deleted ids (no effect/useState loop)
  const visibleAttempts = useMemo(() => {
    return allRows.filter(a => !deletedAttemptIds.includes(a.id))
  }, [allRows, deletedAttemptIds])

  const handleDelete = (id) => {
    if (!id) return

    // Add to persisted deleted ids
    setDeletedAttemptIds(prev => {
      const next = prev.includes(id) ? prev : [...prev, id]
      try { localStorage.setItem('deletedAttemptIds', JSON.stringify(next)) } catch (e) {}
      return next
    })

    // If the user deletes the uploaded CSV entry, remove it from storage
    if (uploadedFileData && uploadedFileData.fileName.replace('.csv', '') === id) {
      setUploadedFileData(null)
      localStorage.removeItem('uploadedTestData')
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#E17B5F]">Attempt history</h2>
          <p className="text-xs text-[#8D8A86]">
            Recent mocks and drills with score and pacing.
          </p>
        </div>
        <UploadTestButton onFileUploadSuccess={handleFileUpload} />
      </header>

      <section className="rounded-xl border border-[#F2D5C8] bg-white overflow-hidden shadow-sm">
        <div className="hidden md:grid grid-cols-[2fr,1fr,1fr,1fr] bg-[#FFF5F0] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7A7068]">
          <div className="px-4 py-3">Attempt</div>
          <div className="px-4 py-3">Date</div>
          <div className="px-4 py-3">Score</div>
          <div className="px-4 py-3">Time</div>
        </div>
        <div className="divide-y divide-[#E7E5E4]">
          {visibleAttempts.map(attempt => (
            <article
              key={attempt.id}
              // className={`grid grid-cols-1 md:grid-cols-[2fr,1fr,1fr,1fr] gap-y-1 md:gap-y-0 bg-white transition-colors ${
              //   attempt.isNew ? 'hover:bg-[#E17B5F]/5 border-l-4 border-[#E17B5F]' : 'hover:bg-[#FFF5F0]'
              // }`}
              className='relative'
            >
              <div className="px-4 py-3 flex items-center justify-between md:block">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{attempt.name}</p>
                    <button
                        className="
                          absolute top-3 right-3
                          px-3 py-1.5
                          text-sm font-medium
                          text-red-500
                          border border-red-200
                          rounded-md
                          hover:bg-red-50
                          hover:border-red-300
                          hover:text-red-600
                          transition
                        "
                        onClick={() => handleDelete(attempt.id)}
                      >
                        Delete
                      </button>
                  {attempt.totalQuestions > 0 && (
                    <p className="text-xs text-[#78716C]">{attempt.correctAnswers}/{attempt.totalQuestions} correct</p>
                  )}
                    {attempt.isNew && <span className="text-xs bg-[#E17B5F] text-white px-2 py-0.5 rounded-full">New</span>}
                  </div>
                  {/* <p className="mt-0.5 text-xs text-[#8D8A86]">ID: {attempt.id}</p> */}
                  {attempt.examType && <p className="text-xs text-[#78716C]">{attempt.examType}</p>}
                </div>
                <p className="mt-0.5 text-xs text-[#78716C] md:hidden">
                  {attempt.date} · {attempt.score}
                </p>
              </div>
              <p className="px-4 py-3 text-sm text-[#7A7068] hidden md:flex items-center">
                {attempt.date}
              </p>
              <p className="px-4 py-3 text-sm font-medium hidden md:flex items-center">
                {attempt.score}
              </p>
              <p className="px-4 py-3 text-sm text-[#57534E] flex items-center justify-between">
                <span>{attempt.time}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAttempt(attempt)
                    setTopicAnalysis(attempt.topicAnalysis)
                  }}
                  className="ml-3 inline-flex items-center rounded-full border border-[#E7E5E4] px-3 py-1 text-[11px] font-medium text-[#57534E] hover:bg-[#F5F5F4]"
                >
                  View breakdown
                </button>
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Breakdown Modal */}
      {selectedAttempt && (
        <BreakdownModal 
          attempt={selectedAttempt}
          topicAnalysis={topicAnalysis}
          onClose={() => {
            setSelectedAttempt(null)
            setTopicAnalysis(null)
          }}
        />
      )}
    </div>
  )
}

