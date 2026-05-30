import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import Store from "lucide-react/dist/esm/icons/store";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import type { ModelOption } from "@/types";
import {
  MenuTrigger,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { connectWorkspace, getModelList } from "@services/tauri";
import { triggerHandoff } from "../../context/useContextHandoff";
import { PROVIDERS, DEFAULT_PROVIDER_ID, PROVIDER_MAP } from "../providers";
import { parseModelListResponse } from "@/features/models/utils/modelListResponse";
import { useEffect, useState } from "react";

type SidebarBottomRailProps = {
  workspaceIds?: string[];
  activeWorkspaceId?: string | null;
  activeThreadId?: string | null;
  /** Available models for dynamic-model providers (e.g. Codex). Already fetched and connection-aware. */
  codexModels?: ModelOption[];
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  onOpenSettings: () => void;
  onOpenMarketplace?: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
};

type UsageRowProps = {
  label: string;
  percent: number | null;
  resetLabel: string | null;
};

function UsageRow({ label, percent, resetLabel }: UsageRowProps) {
  return (
    <div className="sidebar-usage-row">
      <div className="sidebar-usage-row-head">
        <span className="sidebar-usage-name">{label}</span>
        <span className="sidebar-usage-value">
          {percent === null ? "--" : `${percent}%`}
        </span>
      </div>
      <div className="sidebar-usage-bar" aria-hidden>
        <span className="sidebar-usage-bar-fill" style={{ width: `${percent ?? 0}%` }} />
      </div>
      {resetLabel && <div className="sidebar-usage-reset">{resetLabel}</div>}
    </div>
  );
}

export function SidebarBottomRail({
  workspaceIds = [],
  activeWorkspaceId = null,
  activeThreadId = null,
  codexModels = [],
  sessionPercent,
  weeklyPercent,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
  onOpenSettings,
  onOpenMarketplace,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  accountSwitching,
  accountCancelDisabled,
  onSwitchAccount,
  onCancelSwitchAccount,
}: SidebarBottomRailProps) {
  const { settings: appSettings, saveSettings } = useAppSettings();
  const activeProviderId = appSettings.localProvider ?? DEFAULT_PROVIDER_ID;
  const activeProviderConfig = PROVIDER_MAP.get(activeProviderId) ?? PROVIDERS[0];

  // Fallback: fetch models directly when the parent hasn't provided them yet
  // (e.g. no active workspace, or daemon not yet connected).
  const [localDynamicModels, setLocalDynamicModels] = useState<{ id: string; label: string }[]>([]);
  const firstWorkspaceId = workspaceIds[0] ?? null;
  const isDynamicProvider = activeProviderConfig.staticModels === null;
  const hasProvidedModels = codexModels.length > 0;

  useEffect(() => {
    if (!isDynamicProvider || hasProvidedModels || !firstWorkspaceId) {
      setLocalDynamicModels([]);
      return;
    }
    let cancelled = false;
    getModelList(firstWorkspaceId)
      .then((result) => {
        if (!cancelled) {
          const parsed = parseModelListResponse(result);
          setLocalDynamicModels(parsed.map((m) => ({ id: m.id, label: m.displayName })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isDynamicProvider, hasProvidedModels, firstWorkspaceId]);

  // The models to show in the dropdown: static list (e.g. Claude), prop-provided list
  // (e.g. Codex when active workspace is connected), or directly-fetched fallback.
  const providerModels: { id: string; label: string }[] =
    activeProviderConfig.staticModels ??
    (codexModels.length > 0
      ? codexModels.map((m) => ({ id: m.id, label: m.displayName }))
      : localDynamicModels);

  // Currently selected model id for the active provider.
  const selectedModelId =
    activeProviderConfig.getModelId(appSettings) ??
    activeProviderConfig.defaultModelId ??
    providerModels[0]?.id ??
    "";

  // Display label used in the usage header badge.
  const activeModelLabel =
    providerModels.find((m) => m.id === selectedModelId)?.label ?? null;

  const accountMenu = useMenuController();
  const {
    isOpen: accountMenuOpen,
    containerRef: accountMenuRef,
    close: closeAccountMenu,
    toggle: toggleAccountMenu,
  } = accountMenu;

  useEffect(() => {
    if (!showAccountSwitcher) {
      closeAccountMenu();
    }
  }, [closeAccountMenu, showAccountSwitcher]);

  const handleProviderSwitch = (providerId: string) => {
    if (activeWorkspaceId && activeThreadId && providerId !== activeProviderId) {
      triggerHandoff(activeWorkspaceId, activeThreadId, providerId);
    }
    void saveSettings({ ...appSettings, localProvider: providerId as typeof appSettings.localProvider }).then(() => {
      for (const id of workspaceIds) {
        void connectWorkspace(id);
      }
    });
  };

  const handleModelChange = (modelId: string) => {
    void saveSettings({ ...appSettings, ...activeProviderConfig.setModelId(modelId) });
  };

  return (
    <div className="sidebar-bottom-rail">
      <div className="sidebar-usage-panel">
        <div className="sidebar-usage-header">
          <div className="sidebar-usage-kicker">
            Usage
            {activeModelLabel && (
              <span className="sidebar-usage-model-tag">{activeModelLabel}</span>
            )}
          </div>
          {creditsLabel && <div className="sidebar-usage-credits">{creditsLabel}</div>}
        </div>
        {!activeProviderConfig.supportsUsage && sessionPercent === null ? (
          <div className="sidebar-usage-unavailable">
            Not reported by {activeProviderConfig.label} CLI
          </div>
        ) : (
          <div className="sidebar-usage-list">
            <UsageRow
              label="Session"
              percent={sessionPercent}
              resetLabel={sessionResetLabel}
            />
            {showWeekly && (
              <UsageRow
                label="Weekly"
                percent={weeklyPercent}
                resetLabel={weeklyResetLabel}
              />
            )}
          </div>
        )}
      </div>

      <div className="sidebar-provider-switcher">
        <div className="sidebar-provider-switcher-label">Provider</div>
        <div className="sidebar-provider-toggle" role="group" aria-label="Switch provider">
          {PROVIDERS.map((provider) => {
            const modifier = provider.styleModifier
              ? ` sidebar-provider-toggle-btn${provider.styleModifier}`
              : "";
            const active = activeProviderId === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                className={`sidebar-provider-toggle-btn${modifier}${active ? " is-active" : ""}`}
                onClick={() => handleProviderSwitch(provider.id)}
                aria-pressed={active}
              >
                {provider.label}
              </button>
            );
          })}
        </div>
        {(providerModels.length > 0 || activeProviderConfig.staticModels === null) && (
          <select
            className="sidebar-provider-model-select"
            value={selectedModelId}
            onChange={(e) => handleModelChange(e.target.value)}
            aria-label={`${activeProviderConfig.label} model`}
            disabled={providerModels.length === 0}
          >
            {providerModels.length > 0
              ? providerModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))
              : <option value="">Loading models…</option>
            }
          </select>
        )}
      </div>

      <div
        className={`sidebar-bottom-actions${showAccountSwitcher ? "" : " is-compact"}`}
      >
        {showAccountSwitcher && (
          <div className="sidebar-account-menu" ref={accountMenuRef}>
            <MenuTrigger
              isOpen={accountMenuOpen}
              popupRole="dialog"
              className="ghost sidebar-labeled-button sidebar-account-trigger"
              activeClassName="is-open"
              onClick={toggleAccountMenu}
              aria-label="Account"
            >
              <span className="sidebar-account-trigger-content">
                <span className="sidebar-account-avatar" aria-hidden>
                  <User size={12} aria-hidden />
                </span>
                <span className="sidebar-account-trigger-label">Account</span>
              </span>
            </MenuTrigger>
            {accountMenuOpen && (
              <PopoverSurface className="sidebar-account-popover" role="dialog">
                <div className="sidebar-account-title">Account</div>
                <div className="sidebar-account-value">{accountLabel}</div>
                <div className="sidebar-account-actions-row">
                  <button
                    type="button"
                    className="primary sidebar-account-action"
                    onClick={onSwitchAccount}
                    disabled={accountDisabled}
                    aria-busy={accountSwitching}
                  >
                    <span className="sidebar-account-action-content">
                      {accountSwitching && (
                        <span className="sidebar-account-spinner" aria-hidden />
                      )}
                      <span>{accountActionLabel}</span>
                    </span>
                  </button>
                  {accountSwitching && (
                    <button
                      type="button"
                      className="secondary sidebar-account-cancel"
                      onClick={onCancelSwitchAccount}
                      disabled={accountCancelDisabled}
                      aria-label="Cancel account switch"
                      title="Cancel"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  )}
                </div>
              </PopoverSurface>
            )}
          </div>
        )}
        <div className="sidebar-utility-actions">
          {onOpenMarketplace && (
            <button
              className="ghost sidebar-labeled-button sidebar-utility-button sidebar-bottom-marketplace-btn"
              type="button"
              onClick={onOpenMarketplace}
              aria-label="Skill Marketplace"
            >
              <span className="sidebar-labeled-button-icon" aria-hidden>
                <Store size={14} aria-hidden />
              </span>
              <span>Marketplace</span>
            </button>
          )}
          <button
            className="ghost sidebar-labeled-button sidebar-utility-button sidebar-bottom-settings-btn"
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
          >
            <span className="sidebar-labeled-button-icon" aria-hidden>
              <Settings size={14} aria-hidden />
            </span>
            <span>Settings</span>
          </button>
          {showDebugButton && (
            <button
              className="ghost sidebar-utility-button"
              type="button"
              onClick={onOpenDebug}
              aria-label="Open debug log"
            >
              <ScrollText size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
