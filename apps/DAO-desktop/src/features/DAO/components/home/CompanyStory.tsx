import type { CompanyStory } from '../../api/types'
import { HomeSection } from './HomeSection'

type CompanyStorySectionProps = {
  story: CompanyStory
}

export function CompanyStorySection({ story }: CompanyStorySectionProps) {
  return (
    <HomeSection label="Company Story" title="Past · Present · Future">
      <div className="DAO-home-story">
        <div className="DAO-home-story__beat">
          <span className="DAO-home-story__phase">Started</span>
          <p>{story.started}</p>
        </div>
        <div className="DAO-home-story__beat">
          <span className="DAO-home-story__phase">Are</span>
          <p>{story.are}</p>
        </div>
        <div className="DAO-home-story__beat">
          <span className="DAO-home-story__phase">Going</span>
          <p>{story.going}</p>
        </div>
        {story.achievements.length > 0 ? (
          <ul className="DAO-home-story__achievements">
            {story.achievements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {story.milestones && story.milestones.length > 0 ? (
          <ul className="DAO-home-story__milestones">
            {story.milestones.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </HomeSection>
  )
}
