import { Streamdown } from 'streamdown'

import { BRIEFING_COMPONENTS } from '../BriefingCard'

export function CompanyMarkdown({ content }: { content: string }) {
  if (!content.trim()) return null
  return (
    <div className="DAO-company-detail-prose">
      <Streamdown
        components={BRIEFING_COMPONENTS}
        controls={false}
        mode="static"
        parseIncompleteMarkdown={false}
      >
        {content}
      </Streamdown>
    </div>
  )
}
