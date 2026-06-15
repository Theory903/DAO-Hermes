export type ToolTraceStep = {
  tool: string
  status?: string
  preview?: string
  args?: string
  result?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function normalizeStep(raw: Record<string, unknown>, index: number): ToolTraceStep {
  const tool =
    firstString(raw.tool, raw.name, raw.tool_name, raw.type) ?? `step ${index + 1}`
  const status = firstString(raw.status, raw.state)
  const preview = firstString(raw.preview, raw.summary, raw.description, raw.text)
  const args = firstString(raw.args, raw.args_bytes, raw.input)
  const result = firstString(raw.result, raw.result_bytes, raw.output, raw.error)

  return { tool, status, preview, args, result }
}

/** Normalize HITL tool_trace blobs into renderable steps. */
export function formatToolTrace(trace: Record<string, unknown> | undefined): ToolTraceStep[] {
  if (!trace || Object.keys(trace).length === 0) return []

  if (Array.isArray(trace.steps)) {
    return trace.steps
      .map((item, index) => {
        const row = asRecord(item)
        return row ? normalizeStep(row, index) : null
      })
      .filter((step): step is ToolTraceStep => step !== null)
  }

  if (Array.isArray(trace.tool_trace)) {
    return trace.tool_trace
      .map((item, index) => {
        const row = asRecord(item)
        return row ? normalizeStep(row, index) : null
      })
      .filter((step): step is ToolTraceStep => step !== null)
  }

  if (Array.isArray(trace.results)) {
    const steps: ToolTraceStep[] = []
    for (const result of trace.results) {
      const row = asRecord(result)
      if (!row) continue
      const nested = row.tool_trace
      if (Array.isArray(nested)) {
        nested.forEach((item, index) => {
          const step = asRecord(item)
          if (step) steps.push(normalizeStep(step, index))
        })
      } else {
        steps.push(
          normalizeStep(
            {
              tool: 'delegate_task',
              status: row.status,
              preview: row.summary,
            },
            steps.length,
          ),
        )
      }
    }
    if (steps.length > 0) return steps
  }

  const single = normalizeStep(trace, 0)
  if (single.tool !== 'step 1' || single.preview || single.args || single.result) {
    return [single]
  }

  return Object.entries(trace).map(([key, value], index) =>
    normalizeStep(
      {
        tool: key,
        preview: typeof value === 'string' ? value : JSON.stringify(value),
      },
      index,
    ),
  )
}
