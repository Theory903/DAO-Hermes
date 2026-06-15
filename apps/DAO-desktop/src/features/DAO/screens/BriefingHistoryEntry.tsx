import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { BriefingHistoryItem } from "../api/space-api";
import { BriefingCard, formatRelativeTime, splitBriefing } from "./BriefingCard";

export function BriefingHistoryEntry({
  item,
  leadName,
  latest = false,
}: {
  item: BriefingHistoryItem;
  leadName: string;
  latest?: boolean;
}) {
  const [open, setOpen] = useState(latest);
  const { title } = splitBriefing(item.markdown);
  const relative = formatRelativeTime(item.generated_at);

  if (latest) {
    return (
      <BriefingCard
        generatedAt={item.generated_at}
        leadName={leadName}
        markdown={item.markdown}
      />
    );
  }

  return (
    <article className={cn("DAO-reports-briefing-archive", open && "DAO-reports-briefing-archive--open")}>
      <Button
        className="DAO-reports-briefing-archive-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
        variant="ghost"
      >
        <span className="DAO-reports-briefing-archive-copy">
          <span className="DAO-reports-briefing-archive-title">{title ?? "Morning summary"}</span>
          <span className="DAO-reports-briefing-archive-meta">
            {relative}
            {item.trigger_source ? ` · ${item.trigger_source}` : ""}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn("DAO-reports-briefing-archive-chevron", open && "DAO-reports-briefing-archive-chevron--open")}
          size={16}
          strokeWidth={1.75}
        />
      </Button>
      {open ? (
        <div className="DAO-reports-briefing-archive-body">
          <BriefingCard
            generatedAt={item.generated_at}
            leadName={leadName}
            markdown={item.markdown}
          />
        </div>
      ) : null}
    </article>
  );
}
