import type { ComponentProps, ElementType, FC } from "react";
import { Clock, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";

import { preprocessMarkdown } from "@/lib/markdown-preprocess";
import { cn } from "@/lib/utils";

const TAG_CLASSES = {
  blockquote:
    "my-3 border-l-2 border-[color-mix(in_srgb,var(--primary,#ab9ff2)_55%,transparent)] bg-[rgba(171,159,242,0.06)] py-2 pl-3.5 pr-2 text-[0.8125rem] italic text-(--text-secondary,#a3a3a3)",
  h1: "mt-5 mb-2 text-[1.0625rem] font-bold tracking-tight text-(--text-primary,#fff) first:mt-0",
  h2: "mt-4 mb-1.5 text-[0.9375rem] font-semibold tracking-tight text-(--text-primary,#fff) first:mt-0",
  h3: "mt-3.5 mb-1 text-[0.875rem] font-semibold text-(--text-primary,#fff) first:mt-0",
  h4: "mt-3 mb-1 text-[0.8125rem] font-semibold text-(--text-primary,#fff) first:mt-0",
  hr: "my-4 border-(--void-border,#1a1a1a)",
  li: "marker:text-(--text-muted,#525252)",
  ol: "mb-3 list-decimal space-y-1 pl-5 last:mb-0",
  p: "mb-3 text-[0.8125rem] leading-[1.65] text-(--text-secondary,#a3a3a3) last:mb-0",
  pre: "mb-3 overflow-x-auto rounded-lg border border-(--void-border,#1a1a1a) bg-[rgba(0,0,0,0.45)] p-3 font-mono text-[0.75rem] leading-[1.6] text-(--text-secondary,#a3a3a3) last:mb-0",
  strong: "font-semibold text-(--text-primary,#fff)",
  td: "px-2.5 py-1.5 align-top text-[0.8125rem] leading-snug text-(--text-secondary,#a3a3a3)",
  th: "px-2.5 py-1.5 text-left text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-(--text-muted,#525252)",
  thead: "bg-[rgba(255,255,255,0.03)]",
  ul: "mb-3 list-disc space-y-1 pl-5 last:mb-0",
} as const;

function tagged<T extends keyof typeof TAG_CLASSES>(Tag: T) {
  const Component = (({ className, ...rest }: ComponentProps<T>) => {
    const Element = Tag as ElementType;
    return <Element className={cn(TAG_CLASSES[Tag], className)} {...rest} />;
  }) as FC<ComponentProps<T>>;

  Component.displayName = `BriefingMd.${Tag}`;

  return Component;
}

function BriefingAnchor({ children, className, href, ...rest }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "font-medium text-(--primary,#ab9ff2) underline decoration-[color-mix(in_srgb,var(--primary,#ab9ff2)_35%,transparent)] underline-offset-[3px] hover:decoration-(--primary,#ab9ff2)",
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      {...rest}
    >
      {children}
    </a>
  );
}

function BriefingCode({ className, ...rest }: ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "rounded-md bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 font-mono text-[0.86em] text-(--text-primary,#fff)",
        className,
      )}
      {...rest}
    />
  );
}

function BriefingTable({ className, ...rest }: ComponentProps<"table">) {
  return (
    <div className="mb-3 max-w-full overflow-x-auto rounded-lg border border-(--void-border,#1a1a1a) last:mb-0">
      <table
        className={cn(
          "w-full border-collapse text-[0.8125rem] [&_tr]:border-b [&_tr]:border-(--void-border,#1a1a1a) last:[&_tr]:border-0",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

export const BRIEFING_COMPONENTS = {
  a: BriefingAnchor,
  blockquote: tagged("blockquote"),
  code: BriefingCode,
  h1: tagged("h1"),
  h2: tagged("h2"),
  h3: tagged("h3"),
  h4: tagged("h4"),
  hr: tagged("hr"),
  li: tagged("li"),
  ol: tagged("ol"),
  p: tagged("p"),
  pre: tagged("pre"),
  strong: tagged("strong"),
  table: BriefingTable,
  td: tagged("td"),
  th: tagged("th"),
  thead: tagged("thead"),
  ul: tagged("ul"),
};

export function splitBriefing(markdown: string): { title: string | null; body: string } {
  const trimmed = markdown.trim();
  const match = trimmed.match(/^#\s+(.+?)(?:\n+|$)/);
  if (!match) return { title: null, body: trimmed };
  return {
    title: match[1].trim(),
    body: trimmed.slice(match[0].length).trim(),
  };
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaMs = Date.now() - then;
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function estimateReadMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function BriefingCardSkeleton() {
  return (
    <article aria-busy="true" className="DAO-company-briefing-card">
      <header className="DAO-company-briefing-head">
        <div className="DAO-company-briefing-brand">
          <span className="DAO-company-briefing-icon DAO-company-briefing-icon--pulse">
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="DAO-company-briefing-skeleton h-2.5 w-24 rounded" />
            <div className="DAO-company-briefing-skeleton h-4 w-48 max-w-full rounded" />
          </div>
        </div>
      </header>
      <div className="DAO-company-briefing-body space-y-2.5">
        <div className="DAO-company-briefing-skeleton h-3 w-full rounded" />
        <div className="DAO-company-briefing-skeleton h-3 w-[92%] rounded" />
        <div className="DAO-company-briefing-skeleton h-3 w-[88%] rounded" />
        <div className="DAO-company-briefing-skeleton h-3 w-[70%] rounded" />
      </div>
    </article>
  );
}

export function BriefingCard({
  generatedAt,
  leadName,
  markdown,
}: {
  generatedAt?: string | null;
  leadName: string;
  markdown: string;
}) {
  const processed = preprocessMarkdown(markdown);
  const { title, body } = splitBriefing(processed);
  const displayBody = body || processed;
  const readMinutes = estimateReadMinutes(displayBody);
  const relative = generatedAt ? formatRelativeTime(generatedAt) : null;
  const absolute = generatedAt
    ? new Date(generatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <article className="DAO-company-briefing-card">
      <header className="DAO-company-briefing-head">
        <div className="DAO-company-briefing-brand">
          <span className="DAO-company-briefing-icon">
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="DAO-company-briefing-eyebrow">{leadName} briefing</p>
            <h3 className="DAO-company-briefing-title">{title ?? "Morning summary"}</h3>
          </div>
        </div>
        <div className="DAO-company-briefing-meta">
          {relative ? (
            <span className="DAO-company-briefing-meta-item" title={absolute ?? undefined}>
              <Clock size={12} strokeWidth={2} />
              {relative}
            </span>
          ) : null}
          <span className="DAO-company-briefing-meta-item">{readMinutes} min read</span>
        </div>
      </header>

      <div className="DAO-company-briefing-body DAO-util-scrollbar">
        <div className="DAO-company-briefing-prose">
          <Streamdown
            components={BRIEFING_COMPONENTS}
            controls={false}
            mode="static"
            parseIncompleteMarkdown={false}
          >
            {displayBody}
          </Streamdown>
        </div>
      </div>

      {absolute ? (
        <footer className="DAO-company-briefing-foot">
          <time dateTime={generatedAt ?? undefined}>Generated {absolute}</time>
        </footer>
      ) : null}
    </article>
  );
}
