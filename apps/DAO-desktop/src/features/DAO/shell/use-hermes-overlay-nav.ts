import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Open a Hermes overlay route (/settings, /cron, …) and return to the current Space screen on close. */
export function useHermesOverlayNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  return useCallback(
    (path: string) => {
      navigate(path, { state: { returnTo } });
    },
    [navigate, returnTo],
  );
}
