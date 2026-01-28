import { useQuery } from '@tanstack/react-query'
import { fetchExamRecommendations } from '../../services/recommendations'

/**
 * STRICT UI: Card-based list from Gemini JSON ONLY
 * 
 * No text generation, no conditional display, no fallback text
 * Frontend is ONLY a renderer of Gemini cards
 */

function RecommendationCard({ card }) {
  // Normalize priority to lowercase for comparison
  const priority = card.priority?.toLowerCase() || 'low'
  
  return (
    <article className="rounded-xl border border-[#E7E5E4] bg-white p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Priority Badge + Title + Metadata */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[#2D3436] text-base mb-1">{card.subject}</h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap flex-shrink-0 ${
            priority === 'high'
              ? 'bg-red-100 text-red-700'
              : priority === 'medium'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {priority === 'high' ? '⚠ High' : priority === 'medium' ? '○ Medium' : '● Low'}
        </span>
      </div>

      {/* Confidence + Data Points */}
      <div className="flex items-center gap-3 text-xs text-[#78716C] bg-[#F5F5F4] px-3 py-2 rounded">
        <span>{card.confidence}% confidence</span>
        <span>•</span>
        <span>{card.dataPoints} data points</span>
      </div>

      {/* Why This Matters */}
      <div>
        <p className="text-xs text-[#8D8A86] font-semibold uppercase tracking-wide mb-1">
          Why this matters
        </p>
        <p className="text-sm text-[#57534E] leading-snug">{card.why}</p>
      </div>

      {/* Action Steps */}
      <div>
        <p className="text-xs text-[#8D8A86] font-semibold uppercase tracking-wide mb-2">
          Action steps
        </p>
        <ul className="space-y-1.5">
          {card.actions && card.actions.map((action, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-sm text-[#57534E]">
              <span className="text-[#E17B5F] font-bold mt-0.5 flex-shrink-0">→</span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

export function Recommendations() {
  const query = useQuery({
    queryKey: ['recommendations'],
    queryFn: fetchExamRecommendations,
    staleTime: 60000,
    gcTime: 300000,
  })

  // Loading state
  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[#E17B5F]">Insights</h2>
          <p className="text-xs text-[#8D8A86]">Personalized exam preparation analysis</p>
        </header>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-[#E7E5E4] bg-white p-5 space-y-3 animate-pulse"
            >
              <div className="h-6 bg-[#E7E5E4] rounded w-3/4" />
              <div className="h-4 bg-[#E7E5E4] rounded w-full" />
              <div className="h-4 bg-[#E7E5E4] rounded w-5/6" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (query.isError) {
    return (
      <div className="space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[#E17B5F]">Insights</h2>
          <p className="text-xs text-[#8D8A86]">Personalized exam preparation analysis</p>
        </header>
        <article className="rounded-xl border border-dashed border-red-300 bg-red-50 p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-red-900">Unable to load recommendations</p>
          <p className="text-xs text-red-700">{query.error?.message || 'Try uploading a test'}</p>
        </article>
      </div>
    )
  }

  const recommendation = query.data?.data
  const cards = recommendation?.cards || []
  const status = recommendation?.status || 'INSUFFICIENT_DATA'

  // INSUFFICIENT_DATA: No tests at all
  if (status === 'INSUFFICIENT_DATA') {
    return (
      <div className="space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[#E17B5F]">Insights</h2>
          <p className="text-xs text-[#8D8A86]">Personalized exam preparation analysis</p>
        </header>
        <article className="rounded-xl border border-dashed border-[#D6D3D1] bg-[#F5F5F4] p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-[#2D3436]">Upload a test to get started</p>
          <p className="text-xs text-[#78716C]">
            Upload your first test attempt to see personalized insights.
          </p>
        </article>
      </div>
    )
  }

  // HAS_RECOMMENDATIONS: Tests exist, render only if cards generated
  // Empty array = no meaningful patterns (not an error state)
  if (cards.length === 0) {
    return (
      <div className="space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[#E17B5F]">Insights</h2>
          <p className="text-xs text-[#8D8A86]">Personalized exam preparation analysis</p>
        </header>
        <article className="rounded-xl border border-dashed border-[#D6D3D1] bg-[#F5F5F4] p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-[#2D3436]">No significant patterns yet</p>
          <p className="text-xs text-[#78716C]">
            Upload more tests to reveal performance patterns.
          </p>
        </article>
      </div>
    )
  }

  // Render cards
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-base font-semibold text-[#E17B5F]">Insights</h2>
        <p className="text-xs text-[#8D8A86]">Personalized exam preparation analysis</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-1">
        {cards.map((card, idx) => (
          <RecommendationCard key={idx} card={card} />
        ))}
      </div>
    </div>
  )
}
