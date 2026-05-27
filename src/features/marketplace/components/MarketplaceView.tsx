import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Star, Download, Check, ExternalLink, Package } from "lucide-react";
import type { InstalledSkill, MarketplaceSkill } from "../types";
import { SKILL_CATEGORIES, SKILL_PROVIDERS } from "../types";
import {
  marketplaceInstall,
  marketplaceInstalled,
  marketplaceSearch,
  marketplaceUninstall,
} from "../../../services/tauri";

export function MarketplaceView() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [skills, setSkills] = useState<MarketplaceSkill[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<MarketplaceSkill | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[]>(["claude-code"]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSkills = useCallback(async (q: string, cat: string) => {
    setLoading(true);
    setSearchError(null);
    try {
      const results = await marketplaceSearch(q, cat);
      setSkills(results);
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInstalled = useCallback(async () => {
    try {
      const inst = await marketplaceInstalled();
      setInstalled(inst);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadSkills("", "all");
    void loadInstalled();
  }, [loadSkills, loadInstalled]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
      searchTimeout.current = setTimeout(() => {
        void loadSkills(val, category);
      }, 350);
    },
    [category, loadSkills],
  );

  const handleCategoryChange = useCallback(
    (cat: string) => {
      setCategory(cat);
      void loadSkills(query, cat);
    },
    [query, loadSkills],
  );

  const isInstalled = useCallback(
    (skillId: string) => installed.some((i) => i.id === skillId),
    [installed],
  );

  const getInstalledProviders = useCallback(
    (skillId: string) =>
      installed.find((i) => i.id === skillId)?.installedProviders ?? [],
    [installed],
  );

  const handleInstall = useCallback(
    async (skill: MarketplaceSkill) => {
      if (selectedProviders.length === 0) return;
      setInstalling(skill.id);
      try {
        await marketplaceInstall({
          skillId: skill.id,
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description,
          author: skill.author,
          content: skill.content,
          providers: selectedProviders,
        });
        await loadInstalled();
      } catch (e) {
        console.error("Install failed:", e);
      } finally {
        setInstalling(null);
      }
    },
    [selectedProviders, loadInstalled],
  );

  const handleUninstall = useCallback(
    async (skill: MarketplaceSkill) => {
      const providers = getInstalledProviders(skill.id);
      if (providers.length === 0) return;
      setInstalling(skill.id);
      try {
        await marketplaceUninstall(skill.id, skill.name, providers);
        await loadInstalled();
      } catch (e) {
        console.error("Uninstall failed:", e);
      } finally {
        setInstalling(null);
      }
    },
    [getInstalledProviders, loadInstalled],
  );

  const toggleProvider = useCallback((id: string) => {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  return (
    <div className="marketplace-view">
      <div className="marketplace-header">
        <div className="marketplace-title-row">
          <Package size={20} strokeWidth={1.6} />
          <h2 className="marketplace-title">Skill Marketplace</h2>
        </div>
        <p className="marketplace-subtitle">
          Browse and install skills for all your AI coding tools at once.
        </p>
      </div>

      {/* Provider selector */}
      <div className="marketplace-providers">
        <span className="marketplace-providers-label">Install to:</span>
        <div className="marketplace-providers-list">
          {SKILL_PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`marketplace-provider-chip${selectedProviders.includes(p.id) ? " is-selected" : ""}`}
              onClick={() => toggleProvider(p.id)}
              title={p.label}
            >
              <span className="marketplace-provider-icon">{p.icon}</span>
              <span className="marketplace-provider-label">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="marketplace-search-row">
        <div className="marketplace-search-wrap">
          <Search size={14} className="marketplace-search-icon" strokeWidth={1.8} />
          <input
            className="marketplace-search"
            type="text"
            placeholder="Search skills..."
            value={query}
            onChange={handleQueryChange}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="marketplace-categories">
        {SKILL_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`marketplace-cat-btn${category === cat.id ? " is-active" : ""}`}
            onClick={() => handleCategoryChange(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {searchError ? (
        <div className="marketplace-error">Failed to load skills: {searchError}</div>
      ) : loading ? (
        <div className="marketplace-loading">
          <div className="marketplace-spinner" />
          <span>Loading skills…</span>
        </div>
      ) : skills.length === 0 ? (
        <div className="marketplace-empty">No skills found for this search.</div>
      ) : (
        <div className="marketplace-grid">
          {skills.map((skill) => {
            const inst = isInstalled(skill.id);
            const instProviders = getInstalledProviders(skill.id);
            const isBusy = installing === skill.id;
            return (
              <div
                key={skill.id}
                className={`marketplace-card${selectedSkill?.id === skill.id ? " is-selected" : ""}`}
                onClick={() =>
                  setSelectedSkill((prev) =>
                    prev?.id === skill.id ? null : skill,
                  )
                }
              >
                <div className="marketplace-card-header">
                  <span className="marketplace-card-category">{skill.category}</span>
                  {skill.source === "github" && (
                    <span className="marketplace-card-source">GitHub</span>
                  )}
                </div>
                <div className="marketplace-card-name">{skill.displayName}</div>
                <div className="marketplace-card-desc">{skill.description}</div>
                <div className="marketplace-card-tags">
                  {skill.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="marketplace-tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="marketplace-card-footer">
                  <div className="marketplace-card-meta">
                    <span className="marketplace-stars">
                      <Star size={11} strokeWidth={1.8} />
                      {skill.stars.toLocaleString()}
                    </span>
                    <span className="marketplace-author">by {skill.author}</span>
                  </div>
                  <div className="marketplace-card-actions">
                    {skill.githubUrl && (
                      <a
                        className="marketplace-btn marketplace-btn--ghost"
                        href={skill.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="View on GitHub"
                      >
                        <ExternalLink size={13} strokeWidth={1.8} />
                      </a>
                    )}
                    {inst ? (
                      <button
                        type="button"
                        className="marketplace-btn marketplace-btn--installed"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUninstall(skill);
                        }}
                        title={`Installed for: ${instProviders.join(", ")}. Click to uninstall.`}
                      >
                        {isBusy ? (
                          <span className="marketplace-btn-spinner" />
                        ) : (
                          <Check size={13} strokeWidth={2} />
                        )}
                        Installed
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="marketplace-btn marketplace-btn--install"
                        disabled={isBusy || selectedProviders.length === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleInstall(skill);
                        }}
                        title={
                          selectedProviders.length === 0
                            ? "Select at least one provider above"
                            : `Install for: ${selectedProviders.join(", ")}`
                        }
                      >
                        {isBusy ? (
                          <span className="marketplace-btn-spinner" />
                        ) : (
                          <Download size={13} strokeWidth={1.8} />
                        )}
                        Install
                      </button>
                    )}
                  </div>
                </div>
                {inst && instProviders.length > 0 && (
                  <div className="marketplace-card-installed-for">
                    {instProviders.map((p) => {
                      const prov = SKILL_PROVIDERS.find((x) => x.id === p);
                      return prov ? (
                        <span key={p} className="marketplace-installed-chip" title={prov.label}>
                          {prov.icon}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {selectedSkill && (
        <div className="marketplace-detail">
          <div className="marketplace-detail-header">
            <div>
              <div className="marketplace-detail-name">{selectedSkill.displayName}</div>
              <div className="marketplace-detail-meta">
                by {selectedSkill.author} · {selectedSkill.category}
                {selectedSkill.githubUrl && (
                  <a
                    href={selectedSkill.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="marketplace-detail-link"
                  >
                    <ExternalLink size={12} strokeWidth={1.8} /> GitHub
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              className="marketplace-detail-close"
              onClick={() => setSelectedSkill(null)}
            >
              ×
            </button>
          </div>
          <pre className="marketplace-detail-content">{selectedSkill.content}</pre>
        </div>
      )}
    </div>
  );
}
