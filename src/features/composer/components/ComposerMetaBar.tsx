import type { CSSProperties } from "react";
import { useCallback } from "react";
import { BrainCog, SlidersHorizontal, Zap } from "lucide-react";
import type { AccessMode, ServiceTier, ThreadTokenUsage } from "../../../types";
import type { CodexArgsOption } from "../../threads/utils/codexArgsProfiles";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { PROVIDERS, DEFAULT_PROVIDER_ID } from "../../app/providers";

function ProviderToggle({ disabled }: { disabled: boolean }) {
  const { settings, saveSettings } = useAppSettings();
  const activeId = settings.localProvider ?? DEFAULT_PROVIDER_ID;

  const select = useCallback(
    (id: string) => {
      if (id === activeId) return;
      void saveSettings({
        ...settings,
        localProvider: id as typeof settings.localProvider,
      });
    },
    [activeId, settings, saveSettings],
  );

  return (
    <div className="gz-provider-toggle" aria-label="AI provider">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`gz-provider-btn${activeId === p.id ? ` is-active${p.id === "claude" ? " is-active-claude" : ""}` : ""}`}
          onClick={() => select(p.id)}
          disabled={disabled}
          title={`Switch to ${p.label}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

type ComposerMetaBarProps = {
  disabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  selectedServiceTier: ServiceTier | null;
  reasoningSupported: boolean;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  codexArgsOptions?: CodexArgsOption[];
  selectedCodexArgsOverride?: string | null;
  onSelectCodexArgsOverride?: (value: string | null) => void;
  contextUsage?: ThreadTokenUsage | null;
  // Send button
  canSend?: boolean;
  canStop?: boolean;
  isProcessing?: boolean;
  charCount?: number;
  onSend?: () => void;
  onStop?: () => void;
};

export function ComposerMetaBar({
  disabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  selectedServiceTier,
  reasoningSupported,
  accessMode,
  onSelectAccessMode,
  codexArgsOptions = [],
  selectedCodexArgsOverride = null,
  onSelectCodexArgsOverride,
  contextUsage = null,
  canSend = false,
  canStop = false,
  isProcessing = false,
  charCount = 0,
  onSend,
  onStop,
}: ComposerMetaBarProps) {
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? null;
  const selectedModelLabel =
    selectedModel?.displayName || selectedModel?.model || "No models";
  const modelSelectStyle = {
    "--composer-model-select-width": `${Math.max(selectedModelLabel.length + 2, 8)}ch`,
  } as CSSProperties;
  void contextUsage; // kept for future use
  const planMode =
    collaborationModes.find((mode) => mode.id === "plan") ?? null;
  const defaultMode =
    collaborationModes.find((mode) => mode.id === "default") ?? null;
  const canUsePlanToggle =
    Boolean(planMode) &&
    collaborationModes.every(
      (mode) => mode.id === "default" || mode.id === "plan",
    );
  const planSelected = selectedCollaborationModeId === (planMode?.id ?? "");

  return (
    <div className="composer-bar">
      <div className="composer-meta">
        {collaborationModes.length > 0 && (
          canUsePlanToggle ? (
            <div className="composer-select-wrap composer-plan-toggle-wrap">
              <label className="composer-plan-toggle" aria-label="Plan mode">
                <input
                  className="composer-plan-toggle-input"
                  type="checkbox"
                  checked={planSelected}
                  disabled={disabled}
                  onChange={(event) =>
                    onSelectCollaborationMode(
                      event.target.checked
                        ? planMode?.id ?? "plan"
                        : (defaultMode?.id ?? null),
                    )
                  }
                />
                <span className="composer-plan-toggle-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="composer-plan-toggle-label">
                  {planMode?.label || "Plan"}
                </span>
              </label>
            </div>
          ) : (
            <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
              <select
                className="composer-select composer-select--model composer-select--collab"
                aria-label="Collaboration mode"
                value={selectedCollaborationModeId ?? ""}
                onChange={(event) =>
                  onSelectCollaborationMode(event.target.value || null)
                }
                disabled={disabled}
              >
                {collaborationModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label || mode.id}
                  </option>
                ))}
              </select>
            </div>
          )
        )}
        <div className="composer-select-wrap composer-select-wrap--model">
          <span className="composer-icon composer-icon--model" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M8 7.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 15v-5A2.5 2.5 0 0 1 8 7.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="12.5" r="1" fill="currentColor" />
              <circle cx="14.5" cy="12.5" r="1" fill="currentColor" />
              <path
                d="M9.5 15.5h5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M5.5 11H4M20 11h-1.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <select
            className="composer-select composer-select--model"
            aria-label="Model"
            value={selectedModelId ?? ""}
            onChange={(event) => onSelectModel(event.target.value)}
            disabled={disabled}
            style={modelSelectStyle}
          >
            {models.length === 0 && <option value="">No models</option>}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName || model.model}
              </option>
            ))}
          </select>
          {selectedServiceTier === "fast" && (
            <span
              className="composer-fast-indicator"
              role="status"
              aria-label="Fast mode enabled"
              title="Fast mode enabled"
            >
              <Zap size={12} strokeWidth={1.8} />
            </span>
          )}
        </div>
        <div className="composer-select-wrap composer-select-wrap--effort">
          <span className="composer-icon composer-icon--effort" aria-hidden>
            <BrainCog size={14} strokeWidth={1.8} />
          </span>
          <select
            className="composer-select composer-select--effort"
            aria-label="Thinking mode"
            value={selectedEffort ?? ""}
            onChange={(event) => onSelectEffort(event.target.value)}
            disabled={disabled || !reasoningSupported}
          >
            {reasoningOptions.length === 0 && <option value="">Default</option>}
            {reasoningOptions.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </div>
        {codexArgsOptions.length > 1 && onSelectCodexArgsOverride && (
          <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </span>
            <select
              className="composer-select composer-select--approval"
              aria-label="Codex args profile"
              disabled={disabled}
              value={selectedCodexArgsOverride ?? ""}
              onChange={(event) =>
                onSelectCodexArgsOverride(event.target.value || null)
              }
            >
              {codexArgsOptions.map((option) => (
                <option key={option.value || "default"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="composer-select-wrap">
          <span className="composer-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V7l7-3z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 12.5l1.8 1.8 3.7-4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <select
            className="composer-select composer-select--approval"
            aria-label="Agent access"
            disabled={disabled}
            value={accessMode}
            onChange={(event) =>
              onSelectAccessMode(event.target.value as AccessMode)
            }
          >
            <option value="read-only">Read only</option>
            <option value="current">On-Request</option>
            <option value="full-access">Full access</option>
          </select>
        </div>
      </div>
      <div className="composer-context">
        <ProviderToggle disabled={disabled} />
        {charCount > 0 && (
          <span
            className="composer-char-count"
            aria-label={`${charCount} characters`}
          >
            {charCount}
          </span>
        )}
        <button
          type="button"
          className={`composer-send-btn${canStop ? " is-stop" : ""}${isProcessing ? " is-loading" : ""}`}
          onClick={canStop ? onStop : onSend}
          disabled={(!canStop && !canSend) || disabled}
          aria-label={canStop ? "Stop" : "Send"}
          title={canStop ? "Stop" : "Send"}
        >
          {canStop ? (
            <>
              <span className="composer-send-btn-stop" aria-hidden />
              {isProcessing && <span className="composer-send-btn-spinner" aria-hidden />}
            </>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5l6 6m-6-6L6 11m6-6v14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
