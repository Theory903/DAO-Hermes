import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@nanostores/react";
import { AudioLines, KeyRound, LogOut, Palette, RefreshCw, Save, UserPlus } from "lucide-react";

import { fetchAuthMe, patchAuthMe } from '@/lib/DAO-api'
import { $wakeWord, BUILTIN_WAKE_WORDS, setWakeWord } from "@/store/wake-word";

import { SETTINGS_ROUTE } from "@/app/routes";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { useHermesOverlayNav } from "../shell/use-hermes-overlay-nav";

import {
  getJarvisConfig,
  inviteSpaceMember,
  listSpaceMembers,
  patchJarvisConfig,
  removeSpaceMember,
  type SpaceMember,
} from "../api/space-api";
import { useSpaceContext } from "../context/SpaceContext";
import { DEFAULT_LEAD_NAME } from "../lib/space-lead";
import { spaceRoute } from "../routes";
import { CompanyScroll, DAOCompanyShell } from "./_company-shell";
import { SPACE_SECTIONS, SPACE_SHELL } from "./space/space-copy";
import { SpaceSettingsIntro } from "./space/SpaceSettingsIntro";

export function SettingsScreen({ embedded = false }: { embedded?: boolean }) {
  const space = useSpaceContext();
  const { switchSpace, logout } = useAuth();
  const openHermesOverlay = useHermesOverlayNav();
  const [leadName, setLeadName] = useState(space.ai_lead_config?.name ?? DEFAULT_LEAD_NAME);
  const [mission, setMission] = useState(space.ai_lead_config?.mission ?? "");
  const [persona, setPersona] = useState(space.ai_lead_config?.persona ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [birthday, setBirthday] = useState("");
  const [savedBirthday, setSavedBirthday] = useState(false);
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const wake = useStore($wakeWord);
  const [ppnError, setPpnError] = useState<string | null>(null);

  const onUploadPpn = useCallback((file: File | null) => {
    setPpnError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".ppn")) {
      setPpnError("Pick a Porcupine .ppn keyword file.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      if (!base64) {
        setPpnError("Could not read that .ppn file.");
        return;
      }
      const label = file.name.replace(/\.ppn$/i, "").replace(/[_-]+/g, " ").trim();
      setWakeWord({ customPpnBase64: base64, customLabel: label || "Custom keyword" });
    });
    reader.addEventListener("error", () => setPpnError("Could not read that .ppn file."));
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMembersLoading(true);
    void listSpaceMembers(space.id)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setMembersError(err instanceof Error ? err.message : "Failed to load members");
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [space.id]);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthMe()
      .then((profile) => {
        if (cancelled) return;
        const row = profile as {
          display_name?: string
          email?: string
          birthday_mm_dd?: string | null
          preferences?: { birthday_mm_dd?: string | null }
        };
        setProfileName(row.display_name ?? row.email ?? null);
        const bday = row.birthday_mm_dd ?? row.preferences?.birthday_mm_dd;
        if (bday) setBirthday(bday);
      })
      .catch(() => {
        /* optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getJarvisConfig(space.id)
      .then((cfg) => {
        if (cancelled) return;
        setLeadName(cfg.name ?? DEFAULT_LEAD_NAME);
        setMission(cfg.mission ?? "");
        setPersona(cfg.persona ?? "");
      })
      .catch(() => {
        /* keep Space bootstrap values */
      });
    return () => {
      cancelled = true;
    };
  }, [space.id]);

  const saveJarvis = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await patchJarvisConfig(space.id, {
        name: leadName.trim() || DEFAULT_LEAD_NAME,
        mission: mission.trim(),
        persona: persona.trim(),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI Lead config");
    } finally {
      setSaving(false);
    }
  }, [leadName, mission, persona, space.id]);

  const inviteMember = useCallback(async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setMembersError(null);
    try {
      const member = await inviteSpaceMember(space.id, email, inviteRole);
      setMembers((prev) => [...prev, member]);
      setInviteEmail("");
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Invite failed");
    }
  }, [inviteEmail, inviteRole, space.id]);

  const removeMember = useCallback(
    async (memberId: string) => {
      setMembersError(null);
      try {
        await removeSpaceMember(space.id, memberId);
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      } catch (err) {
        setMembersError(err instanceof Error ? err.message : "Remove failed");
      }
    },
    [space.id],
  );

  const settingsGrid = (
    <div className="DAO-company-settings-grid">
          <SpaceSettingsIntro leadName={leadName} slug={space.slug} spaceName={space.name} />

          <section aria-labelledby="space-settings-heading" className="DAO-company-settings-panel">
            <header>
              <p className="DAO-company-settings-eyebrow">{SPACE_SECTIONS.identity.eyebrow}</p>
              <h2 className="DAO-company-settings-title" id="space-settings-heading">
                {space.name}
              </h2>
              <p className="DAO-company-settings-sub">
                <span className="font-mono text-[0.75rem]">/{space.slug}</span>
              </p>
            </header>
            <p className="DAO-company-settings-copy">{SPACE_SECTIONS.identity.blurb}</p>
            <ul className="DAO-company-settings-links">
              <li>
                <Link className="DAO-company-settings-link" to={spaceRoute(space.slug, "memory")}>
                  <span>
                    <strong>Open Memory</strong>
                    <span className="DAO-company-settings-link-desc">
                      Facts, wiki, files, and briefings for this Space
                    </span>
                  </span>
                </Link>
              </li>
            </ul>
            <div className="DAO-company-settings-actions">
              <Button onClick={switchSpace} size="sm" type="button" variant="ghost">
                <RefreshCw size={14} />
                Switch Space
              </Button>
              <Button onClick={logout} size="sm" type="button" variant="ghost">
                <LogOut size={14} />
                Sign out
              </Button>
            </div>
          </section>

          <section aria-labelledby="jarvis-settings-heading" className="DAO-company-settings-panel">
            <header>
              <p className="DAO-company-settings-eyebrow">{SPACE_SECTIONS.lead.eyebrow}</p>
              <h2 className="DAO-company-settings-title" id="jarvis-settings-heading">
                {leadName}
              </h2>
            </header>
            <p className="DAO-company-settings-copy">{SPACE_SECTIONS.lead.blurb}</p>
            <div className="DAO-company-settings-form">
              <label className="DAO-company-settings-field">
                <span>Display name</span>
                <input
                  className="DAO-company-settings-input"
                  onChange={(e) => setLeadName(e.target.value)}
                  value={leadName}
                />
              </label>
              <label className="DAO-company-settings-field">
                <span>Company mission</span>
                <textarea
                  className="DAO-company-settings-textarea"
                  onChange={(e) => setMission(e.target.value)}
                  placeholder="What is this company trying to achieve?"
                  rows={3}
                  value={mission}
                />
              </label>
              <label className="DAO-company-settings-field">
                <span>Persona & tone</span>
                <textarea
                  className="DAO-company-settings-textarea"
                  onChange={(e) => setPersona(e.target.value)}
                  placeholder="Direct, analytical, friendly…"
                  rows={2}
                  value={persona}
                />
              </label>
              {error ? <p className="DAO-company-settings-error">{error}</p> : null}
              {saved ? <p className="DAO-company-settings-success">Saved</p> : null}
              <Button disabled={saving} onClick={() => void saveJarvis()} size="sm" type="button">
                <Save size={14} />
                {saving ? "Saving…" : "Save AI Lead"}
              </Button>
            </div>
          </section>

          <section aria-labelledby="members-heading" className="DAO-company-settings-panel">
            <header>
              <p className="DAO-company-settings-eyebrow">{SPACE_SECTIONS.team.eyebrow}</p>
              <h2 className="DAO-company-settings-title" id="members-heading">
                People in this Space
              </h2>
            </header>
            <p className="DAO-company-settings-copy">{SPACE_SECTIONS.team.blurb}</p>
            {membersLoading ? <p className="DAO-company-settings-copy">Loading members…</p> : null}
            {membersError ? <p className="DAO-company-settings-error">{membersError}</p> : null}
            <ul className="DAO-company-settings-members">
              {members.map((member) => (
                <li key={member.id} className="DAO-company-settings-member-row">
                  <span>
                    <strong>{member.display_name ?? member.email}</strong>
                    <span className="DAO-company-settings-link-desc">
                      {member.email} · {member.role}
                    </span>
                  </span>
                  {member.role !== "owner" ? (
                    <Button
                      onClick={() => void removeMember(member.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="DAO-company-settings-form">
              <label className="DAO-company-settings-field">
                <span>Invite email</span>
                <input
                  className="DAO-company-settings-input"
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  type="email"
                  value={inviteEmail}
                />
              </label>
              <label className="DAO-company-settings-field">
                <span>Role</span>
                <select
                  className="DAO-company-settings-input"
                  onChange={(e) =>
                    setInviteRole(e.target.value as "admin" | "member" | "viewer")
                  }
                  value={inviteRole}
                >
                  <option value="admin">Admin — settings & invites</option>
                  <option value="member">Member — chat & Brain</option>
                  <option value="viewer">Viewer — read only</option>
                </select>
              </label>
              <Button onClick={() => void inviteMember()} size="sm" type="button">
                <UserPlus size={14} />
                Send invite
              </Button>
            </div>
          </section>

          <section aria-labelledby="personal-heading" className="DAO-company-settings-panel">
            <header>
              <p className="DAO-company-settings-eyebrow">{SPACE_SECTIONS.you.eyebrow}</p>
              <h2 className="DAO-company-settings-title" id="personal-heading">
                Home greeting
              </h2>
            </header>
            <p className="DAO-company-settings-copy">
              {profileName ? `Signed in as ${profileName}. ` : ""}
              {SPACE_SECTIONS.you.blurb}
            </p>
            <div className="DAO-company-settings-form">
              <label className="DAO-company-settings-field">
                <span>Birthday (MM-DD)</span>
                <input
                  className="DAO-company-settings-input DAO-company-settings-input--mono"
                  maxLength={5}
                  onChange={(e) => setBirthday(e.target.value)}
                  placeholder="06-14"
                  value={birthday}
                />
              </label>
              {savedBirthday ? <p className="DAO-company-settings-success">Saved to your profile</p> : null}
              <Button
                disabled={savingBirthday || !/^\d{2}-\d{2}$/.test(birthday.trim())}
                onClick={() => {
                  const trimmed = birthday.trim();
                  if (!/^\d{2}-\d{2}$/.test(trimmed)) return;
                  setSavingBirthday(true);
                  void patchAuthMe({ birthday_mm_dd: trimmed })
                    .then(() => {
                      setSavedBirthday(true);
                      window.setTimeout(() => setSavedBirthday(false), 1800);
                    })
                    .finally(() => setSavingBirthday(false));
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                {savingBirthday ? "Saving…" : "Save birthday"}
              </Button>
            </div>
          </section>

          <section aria-labelledby="app-prefs-heading" className="DAO-company-settings-panel">
            <header>
              <p className="DAO-company-settings-eyebrow">{SPACE_SECTIONS.app.eyebrow}</p>
              <h2 className="DAO-company-settings-title" id="app-prefs-heading">
                Preferences
              </h2>
            </header>
            <p className="DAO-company-settings-copy">{SPACE_SECTIONS.app.blurb}</p>
            <ul className="DAO-company-settings-links">
              <li>
                <button
                  className="DAO-company-settings-link"
                  onClick={() => openHermesOverlay(SETTINGS_ROUTE)}
                  type="button"
                >
                  <Palette aria-hidden size={18} />
                  <span>
                    <strong>Appearance & theme</strong>
                    <span className="DAO-company-settings-link-desc">Skins, density, light/dark</span>
                  </span>
                </button>
              </li>
              <li>
                <button
                  className="DAO-company-settings-link"
                  onClick={() => openHermesOverlay(`${SETTINGS_ROUTE}?tab=providers`)}
                  type="button"
                >
                  <KeyRound aria-hidden size={18} />
                  <span>
                    <strong>Models & API keys</strong>
                    <span className="DAO-company-settings-link-desc">Providers, fallbacks, accounts</span>
                  </span>
                </button>
              </li>
              <li>
                <button
                  className="DAO-company-settings-link"
                  onClick={() => openHermesOverlay(SETTINGS_ROUTE)}
                  type="button"
                >
                  <span>
                    <strong>All app settings</strong>
                    <span className="DAO-company-settings-link-desc">Gateway, MCP, sessions, voice</span>
                  </span>
                </button>
              </li>
            </ul>
          </section>

          <details className="DAO-company-settings-panel DAO-company-settings-advanced">
            <summary className="DAO-company-settings-advanced-summary">
              <span>
                <p className="DAO-company-settings-eyebrow">{SPACE_SECTIONS.voice.eyebrow}</p>
                <span className="DAO-company-settings-title">{SPACE_SECTIONS.voice.summary}</span>
              </span>
              <AudioLines aria-hidden className="DAO-company-settings-advanced-icon" size={18} />
            </summary>
            <p className="DAO-company-settings-copy">{SPACE_SECTIONS.voice.blurb}</p>
            <div className="DAO-company-settings-form">
              <label className="DAO-company-settings-field DAO-company-settings-field--row">
                <input
                  checked={wake.enabled}
                  onChange={(e) => setWakeWord({ enabled: e.target.checked })}
                  type="checkbox"
                />
                <span>Enable wake word on Home</span>
              </label>
              <label className="DAO-company-settings-field">
                <span>Picovoice AccessKey</span>
                <input
                  className="DAO-company-settings-input DAO-company-settings-input--mono"
                  onChange={(e) => setWakeWord({ accessKey: e.target.value })}
                  placeholder="From console.picovoice.ai"
                  type="password"
                  value={wake.accessKey}
                />
              </label>
              <label className="DAO-company-settings-field">
                <span>Built-in keyword</span>
                <select
                  className="DAO-company-settings-input"
                  disabled={Boolean(wake.customPpnBase64)}
                  onChange={(e) => setWakeWord({ builtin: e.target.value })}
                  value={wake.builtin}
                >
                  {BUILTIN_WAKE_WORDS.map((word) => (
                    <option key={word} value={word}>
                      {word}
                    </option>
                  ))}
                </select>
              </label>
              <label className="DAO-company-settings-field">
                <span>Custom keyword (.ppn)</span>
                <input
                  accept=".ppn"
                  className="DAO-company-settings-input"
                  onChange={(e) => onUploadPpn(e.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              {wake.customPpnBase64 ? (
                <p className="DAO-company-settings-copy">
                  Using <strong>{wake.customLabel || "Custom keyword"}</strong>.{" "}
                  <button
                    className="underline"
                    onClick={() => setWakeWord({ customPpnBase64: "", customLabel: "" })}
                    type="button"
                  >
                    Use built-in instead
                  </button>
                </p>
              ) : null}
              {ppnError ? <p className="DAO-company-settings-error">{ppnError}</p> : null}
              <label className="DAO-company-settings-field">
                <span>Sensitivity — {Math.round(wake.sensitivity * 100)}%</span>
                <input
                  max={1}
                  min={0}
                  onChange={(e) => setWakeWord({ sensitivity: Number(e.target.value) })}
                  step={0.05}
                  type="range"
                  value={wake.sensitivity}
                />
              </label>
            </div>
          </details>
        </div>
  );

  const content = embedded ? settingsGrid : <CompanyScroll>{settingsGrid}</CompanyScroll>;

  if (embedded) {
    return content;
  }

  return (
    <DAOCompanyShell description={SPACE_SHELL.description} title={SPACE_SHELL.title}>
      {content}
    </DAOCompanyShell>
  );
}
