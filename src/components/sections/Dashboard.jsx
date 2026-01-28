import { useQuery } from '@tanstack/react-query'
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { fetchSummary } from '../../services/analytics'
import { fetchExamRecommendations } from '../../services/recommendations'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart'

const fallbackStats = [
  {
    id: 'avgScore',
    label: 'Average score',
    value: '78%',
    delta: '+6%',
    trend: 'up',
  },
  {
    id: 'questions',
    label: 'Questions attempted',
    value: '1,240',
    delta: '+320',
    trend: 'up',
  },
  {
    id: 'mastery',
    label: 'Topics mastered',
    value: '18 / 32',
    delta: '+4',
    trend: 'up',
  },
  {
    id: 'time',
    label: 'Avg time / question',
    value: '54s',
    delta: '-6s',
    trend: 'down',
  },
]

export function Dashboard() {
  const summaryQuery = useQuery({
    queryKey: ['summary'],
    queryFn: async () => fetchSummary(),
  })

  const recsQuery = useQuery({
    queryKey: ['recommendations'],
    queryFn: async () => fetchExamRecommendations(),
  })

  const summary = summaryQuery.data?.success ? summaryQuery.data.data : null
  const stats = summary
    ? [
        {
          id: 'avgScore',
          label: 'Average score',
          value: `${Math.round(summary.avgAccuracy)}%`,
          delta: `${summary.trend >= 0 ? '+' : ''}${Math.round(summary.trend)}%`,
          trend: summary.trend >= 0 ? 'up' : 'down',
        },
        {
          id: 'questions',
          label: 'Questions attempted',
          value: summary.totalAttempts.toLocaleString(),
          delta: `+${summary.totalAttempts}`,
          trend: 'up',
        },
        {
          id: 'mastery',
          label: 'Overall mastery',
          value: `${Math.round(summary.mastery)}%`,
          delta: `${summary.trend >= 0 ? '+' : ''}${Math.round(summary.trend)}%`,
          trend: summary.trend >= 0 ? 'up' : 'down',
        },
        {
          id: 'time',
          label: 'Avg time / question',
          value: `${Math.round(summary.avgTime)}s`,
          delta: `—`,
          trend: 'neutral',
        },
      ]
    : fallbackStats

  const chartData = (summary?.recent_scores || [62, 69, 71, 75, 80, 83]).map(
    (score, index) => ({
      label: summary?.recent_labels?.[index] || `Test ${index + 1}`,
      score,
    })
  )

  const chartConfig = {
    score: {
      label: 'Score',
      color: 'var(--chart-1, #E17B5F)',
    },
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <article
            key={stat.id}
            className="rounded-xl border border-[#F2D5C8] bg-white p-4 flex flex-col justify-between hover:-translate-y-1 hover:border-[#E17B5F] transition-transform shadow-sm"
          >
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#E17B5F] uppercase mb-1">
              {stat.label}
            </p>
            <p className="text-2xl font-semibold tracking-tight text-[#2D3436]">{stat.value}</p>
            <p
              className={
                'mt-2 text-xs font-medium ' +
                (stat.trend === 'up' ? 'text-emerald-700' : 'text-red-600')
              }
            >
              {stat.delta} vs last 7 days
            </p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <article className="lg:col-span-2 rounded-xl border border-[#F2D5C8] bg-white p-4 shadow-sm">
          <ChartContainer config={chartConfig} className="h-full">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-[#2D3436]">Score trend (last tests)</h2>
              <span className="text-xs text-[#8D8A86]">
                {summaryQuery.isLoading ? 'Loading…' : 'Synced with backend'}
              </span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F4E0D5" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11, fill: '#57534E' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11, fill: '#57534E' }}
                    domain={[0, 100]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--color-score, #E17B5F)"
                    strokeWidth={2.4}
                    dot={{ r: 3, fill: '#fff', stroke: 'var(--color-score, #E17B5F)' }}
                    activeDot={{ r: 5, strokeWidth: 1.5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartContainer>
        </article>

        <article className="rounded-xl border border-[#F2D5C8] bg-white p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#2D3436]">Focus areas</h2>
            <span className="text-xs text-[#8D8A86]">
              {recsQuery.isLoading ? 'Loading…' : 'High impact first'}
            </span>
          </div>
          <ul className="space-y-3 text-sm">
            {recsQuery.data?.success && recsQuery.data.data?.weaknesses ? (
              // Show weaknesses from recommendation
              recsQuery.data.data.weaknesses.slice(0, 3).map((weakness, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="font-medium">{weakness}</p>
                    <p className="text-xs text-[#78716C]">
                      Priority area for improvement
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    High
                  </span>
                </li>
              ))
            ) : (
              // Fallback: default focus areas
              <>
                <li className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Probability & statistics</p>
                    <p className="text-xs text-[#78716C]">
                      Low accuracy on time-pressured questions.
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    High
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Reading comprehension</p>
                    <p className="text-xs text-[#78716C]">
                      Good accuracy, but slower than target pace.
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Medium
                  </span>
                </li>
              </>
            )}
          </ul>
        </article>
      </section>
    </div>
  )
}

