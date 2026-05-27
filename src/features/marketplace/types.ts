export interface MarketplaceSkill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  author: string;
  stars: number;
  content: string;
  source: string;
  tags: string[];
  githubUrl: string | null;
}

export interface InstalledSkill {
  id: string;
  name: string;
  displayName: string;
  installedProviders: string[];
}

export interface InstallSkillArgs {
  skillId: string;
  name: string;
  displayName: string;
  description: string;
  author: string;
  content: string;
  providers: string[];
}

export const SKILL_PROVIDERS: { id: string; label: string; icon: string }[] = [
  { id: "claude-code", label: "Claude Code", icon: "🤖" },
  { id: "cursor", label: "Cursor", icon: "⬛" },
  { id: "windsurf", label: "Windsurf", icon: "🌊" },
  { id: "continue", label: "Continue", icon: "▶️" },
  { id: "aider", label: "Aider", icon: "🔧" },
  { id: "copilot", label: "GitHub Copilot", icon: "🐙" },
];

export const SKILL_CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "code", label: "Code" },
  { id: "design", label: "Design" },
  { id: "efficiency", label: "Efficiency" },
  { id: "planning", label: "Planning" },
  { id: "scraping", label: "Scraping" },
  { id: "devops", label: "DevOps" },
  { id: "mcp", label: "MCP" },
];
