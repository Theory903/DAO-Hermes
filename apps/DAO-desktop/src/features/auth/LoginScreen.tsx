import { FormEvent, useState } from "react";

import { useAuth } from "./AuthProvider";

export function LoginScreen() {
  const { login, loginOAuth, error, oauthProviders, devLoginEnabled } = useAuth();
  const [email, setEmail] = useState("board@example.com");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    try {
      await login(email);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onOAuth(provider: "google" | "github") {
    setLoading(true);
    setLocalError(null);
    try {
      await loginOAuth(provider);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "OAuth login failed");
    } finally {
      setLoading(false);
    }
  }

  const message = localError ?? error;
  const showOAuth = oauthProviders.length > 0;

  return (
    <main className="void-screen void-center void-glow">
      <div className="void-panel">
        <header className="void-hero">
          <div className="void-hero-badges">
            <p className="void-eyebrow">DAO OS</p>
            {devLoginEnabled ? <span className="void-dev-badge">Dev login</span> : null}
          </div>
          <h1 className="void-title">Run your company.</h1>
          <p className="void-subtitle">
            {showOAuth
              ? "Sign in with your work account to open your Space."
              : "Sign in with your work email. Configure Google or GitHub OAuth for cloud deployments."}
          </p>
        </header>

        {showOAuth ? (
          <div className="void-form void-oauth-stack">
            {oauthProviders.includes("google") ? (
              <button
                className="void-button void-button-ghost"
                disabled={loading}
                onClick={() => void onOAuth("google")}
                type="button"
              >
                Continue with Google
              </button>
            ) : null}
            {oauthProviders.includes("github") ? (
              <button
                className="void-button void-button-ghost"
                disabled={loading}
                onClick={() => void onOAuth("github")}
                type="button"
              >
                Continue with GitHub
              </button>
            ) : null}
          </div>
        ) : null}

        {devLoginEnabled ? (
          <form className="void-form" onSubmit={onSubmit}>
            {showOAuth ? (
              <p className="void-footnote void-oauth-divider">Or use dev login</p>
            ) : null}
            <label className="void-label" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              className="void-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus={!showOAuth}
              required
              disabled={loading}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "login-error" : undefined}
            />
            {message ? (
              <p id="login-error" className="void-error void-error-box" role="alert">
                {message}
              </p>
            ) : null}
            <button className="void-button" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="void-spinner void-spinner-inline" aria-hidden />
                  Signing in…
                </>
              ) : (
                "Continue"
              )}
            </button>
          </form>
        ) : message ? (
          <p className="void-error void-error-box" role="alert">
            {message}
          </p>
        ) : null}

        {!devLoginEnabled && !showOAuth ? (
          <p className="void-footnote">OAuth is not configured on this server.</p>
        ) : null}
      </div>
    </main>
  );
}
