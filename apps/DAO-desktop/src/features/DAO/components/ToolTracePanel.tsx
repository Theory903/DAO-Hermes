import { formatToolTrace } from '../lib/formatToolTrace'

type ToolTracePanelProps = {
  trace?: Record<string, unknown>
  emptyLabel?: string
}

export function ToolTracePanel({ trace, emptyLabel = 'No tool steps recorded.' }: ToolTracePanelProps) {
  const steps = formatToolTrace(trace)

  if (steps.length === 0) {
    return <p className="DAO-company-hitl-trace-empty">{emptyLabel}</p>
  }

  return (
    <ol className="DAO-company-tool-trace">
      {steps.map((step, index) => (
        <li key={`${step.tool}-${index}`} className="DAO-company-tool-trace-step">
          <div className="DAO-company-tool-trace-head">
            <span className="DAO-company-tool-trace-name">{step.tool}</span>
            {step.status ? (
              <span
                className={
                  step.status === 'error' || step.status === 'failed'
                    ? 'DAO-company-pill DAO-company-pill--error'
                    : step.status === 'running'
                      ? 'DAO-company-pill DAO-company-pill--pending'
                      : 'DAO-company-pill DAO-company-pill--live'
                }
              >
                {step.status}
              </span>
            ) : null}
          </div>
          {step.preview ? <p className="DAO-company-tool-trace-preview">{step.preview}</p> : null}
          {step.args ? (
            <pre className="DAO-company-tool-trace-block" aria-label="Tool arguments">
              {step.args}
            </pre>
          ) : null}
          {step.result ? (
            <pre className="DAO-company-tool-trace-block" aria-label="Tool result">
              {step.result}
            </pre>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
