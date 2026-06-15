import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { KeybindPanel } from "@/app/shell/keybind-panel";

import { spaceRoute } from "./routes";

import { DAONavigateListener } from "./shell/DAONavigateListener";
import { DAOAppOverlays } from "./shell/DAOAppOverlays";
import { DAOBootScreen } from "./shell/DAOBootScreen";
import { DAOSpaceLayout } from "./shell/DAOShell";
import { HomeScreen } from "./screens/HomeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { BrainScreen } from "./screens/BrainScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { OrgScreen } from "./screens/OrgScreen";
import { BrainReportsRedirect } from "./screens/ReportsScreen";

const HermesChat = lazy(() =>
  import("@/app/desktop-controller").then((mod) => ({ default: mod.DesktopController })),
);

function ChatFallback() {
  return <DAOBootScreen />;
}

/** Legacy /command route → merged Org screen (floor view). */
function CommandRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate replace to="/" />;
  return <Navigate replace to={spaceRoute(slug, "org")} />;
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
        <Route path="brain" element={<BrainScreen />} />
        <Route path="org" element={<OrgScreen />} />
        <Route path="inbox" element={<InboxScreen />} />
        <Route path="reports" element={<BrainReportsRedirect />} />
        <Route path="wiki" element={<BrainReportsRedirect view="wiki" />} />
        <Route path="drive" element={<BrainReportsRedirect view="drive" />} />
        <Route path="settings" element={<SettingsScreen />} />
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
