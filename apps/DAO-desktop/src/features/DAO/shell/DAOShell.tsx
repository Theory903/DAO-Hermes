import { Outlet, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/features/auth";

import { EmptyState, LoadingRows } from "../screens/_ui";
import { SpaceProvider } from "../context/SpaceContext";
import { useSpace } from "../hooks/useSpace";
import { spaceRoute } from "../routes";
import { DAOAppChrome } from "./DAOAppChrome";
import { useDAONavigate } from "../hooks/useDAONavigate";
import { DAOCompanyFooter } from "./DAOCompanyFooter";
import { DAOTopbar } from "./DAOTopbar";

import "../styles/void-tokens.css";
import "../styles/DAO-shell.css";

/** SSE navigate bridge scoped to the active Space layout. */
function DAONavigateBridge({ spaceId, slug }: { spaceId: string; slug: string }) {
  useDAONavigate(spaceId, slug);
  return null;
}

/** Layout for /space/:slug/* company screens (D2 shells). */
export function DAOSpaceLayout() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { spaceSlug, switchSpace } = useAuth();
  const { space, loading, error } = useSpace(slug);

  if (slug && spaceSlug && slug !== spaceSlug) {
    navigate(spaceRoute(spaceSlug), { replace: true });
    return null;
  }

  if (loading) {
    return (
      <DAOAppChrome className="DAO-void DAO-app">
        <DAOTopbar brandLabel={slug || "Space"} slug={slug} />
        <main className="DAO-main">
          <div className="DAO-screen DAO-glow">
            <div className="DAO-screen-inner">
              <LoadingRows count={2} />
            </div>
          </div>
          <DAOCompanyFooter />
        </main>
      </DAOAppChrome>
    );
  }

  if (error || !space) {
    return (
      <DAOAppChrome className="DAO-void DAO-app">
        <DAOTopbar brandLabel={slug || "Space"} slug={slug} />
        <main className="DAO-main">
          <div className="DAO-screen void-center">
            <div className="DAO-screen-inner DAO-panel-narrow">
              <EmptyState
                title="Space unavailable"
                description={error ?? "This Space could not be loaded or you no longer have access."}
              />
              <div className="DAO-error-row DAO-stack-spaced">
                <button type="button" className="void-button" onClick={switchSpace}>
                  Choose another Space
                </button>
              </div>
            </div>
          </div>
          <DAOCompanyFooter />
        </main>
      </DAOAppChrome>
    );
  }

  return (
    <SpaceProvider space={space}>
      <DAONavigateBridge spaceId={space.id} slug={space.slug} />
      <DAOAppChrome className="DAO-void DAO-app">
        <DAOTopbar brandLabel={space.name} slug={space.slug} />
        <main className="DAO-main">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
          <DAOCompanyFooter />
        </main>
      </DAOAppChrome>
    </SpaceProvider>
  );
}

/** @deprecated Use DAOSpaceLayout — kept for router.tsx compatibility */
export const DAOShell = DAOSpaceLayout;
