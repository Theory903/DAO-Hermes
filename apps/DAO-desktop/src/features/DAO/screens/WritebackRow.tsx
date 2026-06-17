import { FileOutput } from "lucide-react";
import { Link } from "react-router-dom";

import { formatRelativeTime } from "./BriefingCard";
import { brainRoute } from "../routes";
import type { WritebackItem } from "../api/space-api";

function fileName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function driveFolderPath(filePath: string): string {
  const norm = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const lastSlash = norm.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return `${norm.slice(0, lastSlash + 1)}`;
}

export function WritebackRow({ item, spaceSlug }: { item: WritebackItem; spaceSlug: string }) {
  const relative = item.created_at ? formatRelativeTime(item.created_at) : null;
  const absolute = item.created_at
    ? new Date(item.created_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <li className="DAO-reports-writeback">
      <Link
        className="DAO-reports-writeback-link"
        to={brainRoute(spaceSlug, { view: "drive", path: driveFolderPath(item.path) })}
      >
        <span aria-hidden className="DAO-reports-writeback-icon">
          <FileOutput size={15} strokeWidth={1.6} />
        </span>
        <span className="DAO-reports-writeback-main">
          <span className="DAO-reports-writeback-name">{fileName(item.path)}</span>
          <span className="DAO-reports-writeback-path">{item.path}</span>
        </span>
      </Link>
      <div className="DAO-reports-writeback-meta">
        {item.produced_by_dept ? (
          <span className="DAO-company-pill DAO-company-pill--ready">{item.produced_by_dept}</span>
        ) : null}
        {relative ? (
          <time className="DAO-reports-writeback-time" dateTime={item.created_at ?? undefined} title={absolute ?? undefined}>
            {relative}
          </time>
        ) : null}
      </div>
    </li>
  );
}
