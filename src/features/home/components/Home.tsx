import { useMemo } from "react";
import type {
  AccountSnapshot,
  LocalUsageSnapshot,
  RateLimitSnapshot,
} from "../../../types";
import type {
  LatestAgentRun,
  UsageMetric,
  UsageWorkspaceOption,
} from "../homeTypes";

type HomeProps = {
  onAddWorkspace: () => void;
  onAddWorkspaceFromUrl: () => void;
  latestAgentRuns: LatestAgentRun[];
  isLoadingLatestAgents: boolean;
  localUsageSnapshot: LocalUsageSnapshot | null;
  isLoadingLocalUsage: boolean;
  localUsageError: string | null;
  onRefreshLocalUsage: () => void;
  usageMetric: UsageMetric;
  onUsageMetricChange: (metric: UsageMetric) => void;
  usageWorkspaceId: string | null;
  usageWorkspaceOptions: UsageWorkspaceOption[];
  onUsageWorkspaceChange: (workspaceId: string | null) => void;
  accountRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
  accountInfo: AccountSnapshot | null;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onToggleGitSidebar?: () => void;
  gitSidebarOpen?: boolean;
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function Home({
  onAddWorkspace,
  onAddWorkspaceFromUrl,
  latestAgentRuns,
  onSelectThread,
}: HomeProps) {
  // One entry per workspace, most recent first, capped at 5
  const recentProjects = useMemo(() => {
    const seen = new Set<string>();
    const result: LatestAgentRun[] = [];
    for (const run of latestAgentRuns) {
      if (!seen.has(run.workspaceId)) {
        seen.add(run.workspaceId);
        result.push(run);
        if (result.length >= 5) break;
      }
    }
    return result;
  }, [latestAgentRuns]);

  return (
    <div className="home home-genz">
      <div className="home-genz-bg-grid" aria-hidden />

      <div className="home-genz-hero">
        <div className="home-genz-eyebrow">AI CODING TERMINAL</div>

        <h1 className="home-genz-headline">
          <span className="home-genz-line-orange">NO</span>
          <span className="home-genz-line-white">EXCUSES</span>
          <span className="home-genz-line-orange">— SHIP</span>
          <span className="home-genz-line-white">FASTER.</span>
        </h1>

        <p className="home-genz-sub">
          Orchestrate AI agents across every project. Zero friction.
        </p>

        <div className="home-genz-actions">
          <button
            className="home-genz-btn home-genz-btn-primary"
            onClick={onAddWorkspace}
            data-tauri-drag-region="false"
          >
            + Add Workspace
          </button>
          <button
            className="home-genz-btn home-genz-btn-ghost"
            onClick={onAddWorkspaceFromUrl}
            data-tauri-drag-region="false"
          >
            ⤓ From URL
          </button>
        </div>
      </div>

      {recentProjects.length > 0 && (
        <div className="home-genz-recent" data-tauri-drag-region="false">
          <div className="home-genz-recent-label">RECENT PROJECTS</div>
          <ul className="home-genz-recent-list">
            {recentProjects.map((run) => (
              <li key={run.workspaceId}>
                <button
                  type="button"
                  className={`home-genz-recent-item${run.isProcessing ? " is-active" : ""}`}
                  onClick={() => onSelectThread(run.workspaceId, run.threadId)}
                  data-tauri-drag-region="false"
                >
                  <span className="home-genz-recent-dot" aria-hidden />
                  <span className="home-genz-recent-copy">
                    <span className="home-genz-recent-name">{run.projectName}</span>
                    <span className="home-genz-recent-msg">{run.message}</span>
                  </span>
                  <span className="home-genz-recent-time">{relativeTime(run.timestamp)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="home-genz-corner-text" aria-hidden>
        限界を超える
      </div>
    </div>
  );
}
