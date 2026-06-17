import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { KeybindPanel } from "@/app/shell/keybind-panel";

import { spaceRoute } from "./routes";

import { DAONavigateListener } from "./shell/DAONavigateListener";
import { DAOAppOverlays } from "./shell/DAOAppOverlays";
import { DAOBootScreen } from "./shell/DAOBootScreen";
import { DAOSpaceLayout } from "./shell/DAOShell";
import { HomeScreen } from "./screens/HomeScreen";
import { ControlScreen } from "./screens/ControlScreen";
import { AutomationScreen } from "./screens/AutomationScreen";
import { MemoryScreen } from "./screens/MemoryScreen";
import { WorkScreen } from "./screens/WorkScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { MemoryReportsRedirect } from "./screens/ReportsScreen";

const HermesChat = lazy(() =>
  import("@/app/desktop-controller").then((mod) => ({ default: mod.DesktopController })),
);

function ChatFallback() {
  return <DAOBootScreen />;
}

/** Legacy /command → Work operations lens. */
function CommandRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate replace to="/" />;
  return <Navigate replace to={`${spaceRoute(slug, "work")}?view=operations`} />;
}

/** Legacy /org → Control organization section. */
function OrgRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate replace to="/" />;
  return <Navigate replace to={`${spaceRoute(slug, "control")}?section=organization`} />;
}

/** Legacy /brain → Memory lens. */
function BrainRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate replace to="/" />;
  return <Navigate replace to={spaceRoute(slug, "memory")} />;
}

/** Legacy /settings → Control lens. */
function SettingsRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate replace to="/" />;
  return <Navigate replace to={spaceRoute(slug, "control")} />;
}

/** Deep link /work/:objectId → query param on Work lens. */
function WorkObjectRedirect() {
  const { slug, objectId } = useParams<{ slug: string; objectId: string }>();
  if (!slug || !objectId) return <Navigate replace to="/" />;
  return <Navigate replace to={`${spaceRoute(slug, "work")}?object=${encodeURIComponent(objectId)}`} />;
}

/** Deep link /memory/:objectId → query param on Memory lens. */
function MemoryObjectRedirect() {
  const { slug, objectId } = useParams<{ slug: string; objectId: string }>();
  if (!slug || !objectId) return <Navigate replace to="/" />;
  return <Navigate replace to={`${spaceRoute(slug, "memory")}?object=${encodeURIComponent(objectId)}`} />;
}

export function DAOAppRoutes() {
  return (
    <>
      <KeybindPanel />
      <DAONavigateListener />
      <DAOAppOverlays />
      <Routes>
      <Route path="/space/:slug" element={<DAOSpaceLayout />}>
        <Route index element={<HomeScreen />} />
        <Route path="chat" element={<Navigate replace to="/" />} />
        <Route path="command" element={<CommandRedirect />} />
        <Route path="brain" element={<BrainRedirect />} />
        <Route path="memory" element={<MemoryScreen />} />
        <Route path="memory/:objectId" element={<MemoryObjectRedirect />} />
        <Route path="work" element={<WorkScreen />} />
        <Route path="work/:objectId" element={<WorkObjectRedirect />} />
        <Route path="automation" element={<AutomationScreen />} />
        <Route path="control" element={<ControlScreen />} />
        <Route path="org" element={<OrgRedirect />} />
        <Route path="inbox" element={<InboxScreen />} />
        <Route path="reports" element={<MemoryReportsRedirect />} />
        <Route path="wiki" element={<MemoryReportsRedirect view="wiki" />} />
        <Route path="drive" element={<MemoryReportsRedirect view="drive" />} />
        <Route path="settings" element={<SettingsRedirect />} />
      </Route>

      <Route
        path="/*"
        element={
          <Suspense fallback={<ChatFallback />}>
            <HermesChat />
          </Suspense>
        }
      />
    </Routes>
    </>
  );
}
