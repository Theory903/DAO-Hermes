/**
 * DAO OS embed entry — full Hermes dashboard inside Next.js.
 */
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { SystemActionsProvider } from "./contexts/SystemActions";
import { I18nProvider } from "./i18n";
import { exposePluginSDK } from "./plugins";
import { ThemeProvider, seedBuiltinTheme } from "./themes";
import "./index.css";

exposePluginSDK();

const DAO_DEFAULT_THEME = "void";

export type HermesDashboardRootProps = {
  /** React-router basename, e.g. /space/acme */
  basename: string;
};

export function HermesDashboardRoot({ basename }: HermesDashboardRootProps) {
  const DAOEmbed = typeof window !== "undefined" && !!window.__DAO_HERMES__;
  const defaultThemeName = DAOEmbed ? DAO_DEFAULT_THEME : "default";

  if (DAOEmbed && typeof window !== "undefined") {
    const stored = window.localStorage.getItem("hermes-dashboard-theme");
    if (!stored) {
      seedBuiltinTheme(DAO_DEFAULT_THEME);
    }
    // Never apply Hermes font overrides in DAO — VOID theme fonts only.
    window.localStorage.removeItem("hermes-dashboard-font");
  }

  return (
    <BrowserRouter basename={basename}>
      <I18nProvider>
        <ThemeProvider defaultThemeName={defaultThemeName}>
          <SystemActionsProvider>
            <App />
          </SystemActionsProvider>
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
