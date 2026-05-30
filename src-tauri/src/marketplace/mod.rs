use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::command;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketplaceSkill {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub category: String,
    pub author: String,
    pub stars: u32,
    pub content: String,
    pub source: String,
    pub tags: Vec<String>,
    pub github_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledSkill {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub installed_providers: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallSkillArgs {
    pub skill_id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub author: String,
    pub content: String,
    pub providers: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GithubSearchResponse {
    items: Vec<GithubRepo>,
}

#[derive(Debug, Deserialize)]
struct GithubRepo {
    id: u64,
    name: String,
    full_name: String,
    description: Option<String>,
    stargazers_count: u32,
    owner: GithubOwner,
    topics: Vec<String>,
    html_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubOwner {
    login: String,
}

// ─── Provider install paths ────────────────────────────────────────────────────

fn provider_install_path(home: &PathBuf, provider: &str, name: &str) -> Option<PathBuf> {
    match provider {
        "claude-code" => Some(home.join(".claude").join("skills").join(name).join("SKILL.md")),
        "cursor" => Some(home.join(".cursor").join("rules").join(format!("{}.mdc", name))),
        "windsurf" => Some(
            home.join(".codeium")
                .join("windsurf")
                .join("memories")
                .join(format!("{}.md", name)),
        ),
        "continue" => Some(home.join(".continue").join("prompts").join(format!("{}.md", name))),
        "aider" => Some(home.join(".aider").join("prompts").join(format!("{}.md", name))),
        "copilot" => Some(
            home.join(".config")
                .join("copilot-skills")
                .join(format!("{}.md", name)),
        ),
        _ => None,
    }
}

fn format_skill_content(
    provider: &str,
    name: &str,
    display_name: &str,
    description: &str,
    author: &str,
    content: &str,
) -> String {
    match provider {
        "claude-code" => format!(
            "---\nname: {}\ndescription: {}\nversion: 1.0.0\nauthor: {}\n---\n\n{}",
            name, description, author, content
        ),
        "cursor" => format!(
            "---\ndescription: {}\nalwaysApply: false\n---\n\n{}",
            description, content
        ),
        _ => format!(
            "# {}\n\n> {}\n> Author: {}\n\n---\n\n{}",
            display_name, description, author, content
        ),
    }
}

// ─── Installed skills registry ─────────────────────────────────────────────────

fn installed_registry_path(home: &PathBuf) -> PathBuf {
    home.join(".claude").join("marketplace").join("installed.json")
}

fn load_installed(home: &PathBuf) -> HashMap<String, InstalledSkill> {
    let path = installed_registry_path(home);
    if let Ok(data) = std::fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

fn save_installed(home: &PathBuf, registry: &HashMap<String, InstalledSkill>) {
    let path = installed_registry_path(home);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(data) = serde_json::to_string_pretty(registry) {
        let _ = std::fs::write(&path, data);
    }
}

// ─── Curated skills ────────────────────────────────────────────────────────────

pub fn curated_skills() -> Vec<MarketplaceSkill> {
    vec![
        MarketplaceSkill {
            id: "curated-ui-designer".into(),
            name: "ui-designer".into(),
            display_name: "UI Designer".into(),
            description: "Generate polished UI components with consistent design tokens, spacing, and accessibility best practices.".into(),
            category: "design".into(),
            author: "community".into(),
            stars: 842,
            content: r#"You are an expert UI designer and frontend engineer. When asked to create UI:

1. Use semantic HTML with accessibility attributes (aria-label, role, tabindex)
2. Apply consistent spacing using 4px/8px grid system
3. Ensure color contrast meets WCAG AA (4.5:1 for normal text)
4. Include hover, focus, and active states for interactive elements
5. Use CSS custom properties for theming
6. Make components responsive by default
7. Add smooth transitions (150-200ms) for state changes
8. Use system font stacks unless specified otherwise

Always output complete, copy-paste ready code."#.into(),
            source: "curated".into(),
            tags: vec!["ui".into(), "css".into(), "accessibility".into(), "design-system".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-token-optimizer".into(),
            name: "token-optimizer".into(),
            display_name: "Token Optimizer".into(),
            description: "Compress prompts and responses to use fewer tokens without losing meaning. Ideal for long contexts.".into(),
            category: "efficiency".into(),
            author: "community".into(),
            stars: 1203,
            content: r#"When writing or reviewing prompts and responses, optimize for token efficiency:

1. Use abbreviations where unambiguous (fn > function, var > variable, impl > implementation)
2. Remove filler phrases ("I would like to", "Please note that", "It's worth mentioning")
3. Use bullet points instead of prose for lists
4. Omit obvious context that's in the conversation history
5. Prefer concise technical terms over verbose descriptions
6. Use code instead of prose to describe algorithms
7. Skip pleasantries and get directly to the answer
8. When summarizing, aim for 30-50% compression while preserving all key information

Apply these principles proactively without being asked."#.into(),
            source: "curated".into(),
            tags: vec!["efficiency".into(), "tokens".into(), "optimization".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-task-planner".into(),
            name: "task-planner".into(),
            display_name: "Task Planner".into(),
            description: "Break down complex projects into actionable tasks with dependencies, estimates, and priorities.".into(),
            category: "planning".into(),
            author: "community".into(),
            stars: 678,
            content: r#"When given a project or feature request, create a structured plan:

1. **Decompose** into atomic tasks (2-4 hours each max)
2. **Identify dependencies** between tasks (what blocks what)
3. **Estimate complexity**: S/M/L/XL
4. **Assign priority**: P0 (blocker) / P1 (high) / P2 (normal) / P3 (nice-to-have)
5. **Group into phases**: Foundation → Core → Polish → Testing
6. **Flag risks** and unknowns explicitly
7. Output as a structured markdown checklist with estimated total time

Format:
```
## Phase 1: Foundation (Est: X days)
- [ ] Task name [M, P0] — brief description
  - Depends on: nothing
  - Risk: any risks
```"#.into(),
            source: "curated".into(),
            tags: vec!["planning".into(), "project-management".into(), "tasks".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-web-scraper".into(),
            name: "web-scraper".into(),
            display_name: "Web Scraper".into(),
            description: "Write robust web scrapers with rate limiting, error handling, and respectful crawling practices.".into(),
            category: "scraping".into(),
            author: "community".into(),
            stars: 445,
            content: r#"When writing web scraping code:

1. **Always respect robots.txt** — check before scraping
2. **Rate limit requests**: add 1-3s delays between requests
3. **Set proper User-Agent**: identify your scraper honestly
4. **Handle errors gracefully**: retry with exponential backoff (max 3 retries)
5. **Use CSS selectors** over XPath for readability
6. **Cache responses** during development to avoid hammering servers
7. **Handle pagination**: detect and follow next-page links
8. **Extract structured data**: return typed objects, not raw HTML
9. **Prefer official APIs** when available over scraping

Default stack: Python + httpx + BeautifulSoup or Playwright for JS-heavy sites.
Always include type hints and docstrings."#.into(),
            source: "curated".into(),
            tags: vec!["scraping".into(), "python".into(), "data-extraction".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-code-reviewer".into(),
            name: "code-reviewer".into(),
            display_name: "Code Reviewer".into(),
            description: "Thorough code review covering correctness, security, performance, and maintainability.".into(),
            category: "code".into(),
            author: "community".into(),
            stars: 1567,
            content: r#"When reviewing code, check these areas in order:

**Correctness**
- Logic errors, off-by-one, null/undefined handling
- Edge cases (empty input, max values, concurrent access)
- Error propagation and handling

**Security** (OWASP Top 10)
- Injection vulnerabilities (SQL, command, XSS)
- Hardcoded secrets or credentials
- Insecure deserialization
- Missing authentication/authorization checks

**Performance**
- N+1 queries, unnecessary loops
- Missing indexes for database queries
- Memory leaks, large allocations

**Maintainability**
- Function/variable naming clarity
- Code duplication (DRY violations)
- Missing tests for critical paths
- Overly complex logic that should be simplified

Output: numbered list of issues with severity (critical/major/minor) and suggested fix."#.into(),
            source: "curated".into(),
            tags: vec!["code-review".into(), "security".into(), "quality".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-test-generator".into(),
            name: "test-generator".into(),
            display_name: "Test Generator".into(),
            description: "Generate comprehensive test suites covering happy paths, edge cases, and error conditions.".into(),
            category: "code".into(),
            author: "community".into(),
            stars: 923,
            content: r#"When generating tests:

1. **Cover the happy path** first (normal, expected usage)
2. **Edge cases**: empty input, null/undefined, zero, max values, special characters
3. **Error conditions**: what should throw/fail and with what error
4. **Boundary values**: min-1, min, min+1, max-1, max, max+1
5. **Concurrency** (if applicable): race conditions, ordering
6. Use **descriptive test names**: "should return null when input is empty"
7. Follow **AAA pattern**: Arrange / Act / Assert
8. Mock external dependencies (HTTP, DB, filesystem)
9. Aim for **one assertion per test** where possible
10. Include integration tests for critical user flows

Prefer the testing framework already in use. If none, suggest Jest (TS/JS) or pytest (Python)."#.into(),
            source: "curated".into(),
            tags: vec!["testing".into(), "jest".into(), "pytest".into(), "tdd".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-docs-writer".into(),
            name: "docs-writer".into(),
            display_name: "Docs Writer".into(),
            description: "Generate clear, complete documentation including README, API docs, and inline comments.".into(),
            category: "code".into(),
            author: "community".into(),
            stars: 712,
            content: r#"When writing documentation:

**README structure**:
1. One-line description + badges
2. What problem it solves (2-3 sentences)
3. Quick start (working example in < 5 steps)
4. Installation
5. Usage with real examples
6. API reference
7. Configuration options
8. Contributing guide
9. License

**API docs**: Each function/method should have:
- Purpose (1 line)
- Parameters with types and descriptions
- Return value with type
- Example usage
- Throws/errors (if any)

**Inline comments**: Only explain *why*, not *what*. The code shows what; comments explain non-obvious decisions, workarounds, or business logic.

Use present tense, active voice. Assume the reader is a competent developer unfamiliar with this codebase."#.into(),
            source: "curated".into(),
            tags: vec!["documentation".into(), "readme".into(), "api-docs".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-devops-helper".into(),
            name: "devops-helper".into(),
            display_name: "DevOps Helper".into(),
            description: "Write production-ready CI/CD pipelines, Dockerfiles, and infrastructure-as-code.".into(),
            category: "devops".into(),
            author: "community".into(),
            stars: 589,
            content: r#"When writing DevOps configurations:

**Docker**:
- Use official minimal base images (alpine, distroless)
- Multi-stage builds to minimize final image size
- Run as non-root user
- Pin dependency versions exactly
- Add .dockerignore
- Health checks for long-running services

**CI/CD (GitHub Actions / GitLab)**:
- Cache dependencies between runs
- Fail fast: lint → test → build → deploy
- Use secrets for credentials, never hardcode
- Add timeout to each job
- Run tests in parallel where possible
- Gate deployments on test passage

**Infrastructure**:
- Use IaC (Terraform/Pulumi) for reproducibility
- Tag all resources
- Principle of least privilege for IAM/service accounts
- Enable logging and monitoring from day 1

Always include comments explaining non-obvious choices."#.into(),
            source: "curated".into(),
            tags: vec!["docker".into(), "ci-cd".into(), "terraform".into(), "github-actions".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-refactor-helper".into(),
            name: "refactor-helper".into(),
            display_name: "Refactor Helper".into(),
            description: "Systematically refactor code for clarity, performance, and maintainability without changing behavior.".into(),
            category: "code".into(),
            author: "community".into(),
            stars: 834,
            content: r#"When refactoring code:

**Principles** (never change behavior):
1. Write tests FIRST if they don't exist (to verify behavior preserved)
2. Make one change at a time, verify after each
3. Run tests after each change

**Common refactors to apply**:
- Extract repeated code into named functions
- Replace magic numbers/strings with named constants
- Rename variables/functions to be self-describing
- Flatten deeply nested conditionals (early returns)
- Split large functions (>30 lines) into smaller ones
- Remove dead code only when 100% sure it's unused
- Replace comments with better-named code where possible
- Convert imperative loops to functional (map/filter/reduce) where clearer

**Do NOT**:
- Change external interfaces/APIs
- Optimize prematurely without profiling data
- Refactor and fix bugs simultaneously
- Mix style changes with logic changes in the same commit"#.into(),
            source: "curated".into(),
            tags: vec!["refactoring".into(), "clean-code".into(), "maintainability".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-color-palette".into(),
            name: "color-palette".into(),
            display_name: "Color Palette Generator".into(),
            description: "Generate accessible, harmonious color palettes with semantic naming and CSS custom properties.".into(),
            category: "design".into(),
            author: "community".into(),
            stars: 347,
            content: r#"When generating color palettes:

1. **Start with brand primary** → derive 9-shade scale (50→900)
2. **Generate semantic tokens**:
   - surface, surface-raised, surface-overlay
   - text-primary, text-secondary, text-disabled
   - border-subtle, border-default, border-strong
   - accent-primary, accent-secondary
   - status-success, status-warning, status-error, status-info
3. **Both light AND dark mode** variants
4. **Check contrast ratios** (WCAG AA minimum):
   - Normal text on background: 4.5:1
   - Large text/UI elements: 3:1
5. Output as CSS custom properties on :root and [data-theme="dark"]
6. Include a usage example showing token application

Use HSL for easier manipulation. Name tokens by role, not value (--text-primary not --gray-900)."#.into(),
            source: "curated".into(),
            tags: vec!["design".into(), "colors".into(), "css".into(), "accessibility".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-git-helper".into(),
            name: "git-helper".into(),
            display_name: "Git Workflow Helper".into(),
            description: "Write clear commit messages, create PRs, and manage branches following Git best practices.".into(),
            category: "devops".into(),
            author: "community".into(),
            stars: 1102,
            content: r#"When working with Git:

**Commit messages** (Conventional Commits):
```
<type>(<scope>): <short summary>

[optional body]
[optional footer]
```
Types: feat / fix / docs / style / refactor / test / chore / perf / ci / build
- Subject line: max 72 chars, imperative mood ("Add" not "Added")
- Body: explain *why*, not *what*

**Branch naming**:
- feature/ticket-123-short-description
- fix/bug-description
- chore/task-description

**PR description template**:
```
## What
[1-2 sentences describing the change]

## Why
[Motivation and context]

## How
[Key implementation decisions]

## Testing
[How to test / what was tested]
```

**Golden rules**:
- One logical change per commit
- Never force-push to main/master
- Rebase feature branches before merging (cleaner history)
- Tag releases with semantic versions (v1.2.3)"#.into(),
            source: "curated".into(),
            tags: vec!["git".into(), "commits".into(), "workflow".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-api-designer".into(),
            name: "api-designer".into(),
            display_name: "REST API Designer".into(),
            description: "Design clean, consistent REST APIs following OpenAPI standards with proper status codes and error formats.".into(),
            category: "code".into(),
            author: "community".into(),
            stars: 678,
            content: r#"When designing REST APIs:

**URL structure**:
- Nouns, not verbs: /users not /getUsers
- Plural resources: /users/{id}
- Nested for ownership: /users/{id}/posts
- Avoid deep nesting > 2 levels

**HTTP methods**:
- GET: read (idempotent, cacheable)
- POST: create new resource
- PUT: replace entire resource
- PATCH: partial update
- DELETE: remove resource

**Status codes**:
- 200 OK, 201 Created, 204 No Content
- 400 Bad Request (validation), 401 Unauthorized, 403 Forbidden, 404 Not Found
- 409 Conflict, 422 Unprocessable Entity
- 429 Too Many Requests, 500 Internal Server Error

**Error response format**:
```json
{ "error": "RESOURCE_NOT_FOUND", "message": "User 123 not found", "details": {} }
```

**Always include**: pagination (cursor-based), filtering, sorting, versioning (/v1/), rate limit headers."#.into(),
            source: "curated".into(),
            tags: vec!["api".into(), "rest".into(), "openapi".into(), "backend".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-perf-optimizer".into(),
            name: "perf-optimizer".into(),
            display_name: "Performance Optimizer".into(),
            description: "Profile and optimize frontend and backend performance bottlenecks with measurable improvements.".into(),
            category: "efficiency".into(),
            author: "community".into(),
            stars: 523,
            content: r#"When optimizing performance:

**Measure first** (never optimize without data):
- Frontend: Chrome DevTools Lighthouse, Performance tab
- Backend: profiling tools (py-spy, pprof, async-profiler)
- Database: EXPLAIN ANALYZE on slow queries

**Frontend quick wins**:
- Lazy load routes and heavy components
- Virtualize long lists (react-virtual, @tanstack/virtual)
- Memoize expensive computations (useMemo, React.memo)
- Debounce search/resize handlers (300ms)
- Compress images (WebP), use responsive srcset
- Preload critical resources, defer non-critical

**Backend quick wins**:
- Add database indexes for frequent query columns
- Cache expensive operations (Redis/memory, 5-60min TTL)
- Batch database queries (avoid N+1)
- Use connection pooling
- Compress API responses (gzip/brotli)
- Paginate large result sets

**Rule**: get 80% improvement from 20% of changes. Focus on the top bottleneck first."#.into(),
            source: "curated".into(),
            tags: vec!["performance".into(), "optimization".into(), "frontend".into(), "backend".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-security-auditor".into(),
            name: "security-auditor".into(),
            display_name: "Security Auditor".into(),
            description: "Audit code for OWASP Top 10 vulnerabilities and common security misconfigurations.".into(),
            category: "code".into(),
            author: "community".into(),
            stars: 891,
            content: r#"Security audit checklist (OWASP Top 10 + extras):

**A01 - Broken Access Control**
- Verify authorization on every protected endpoint
- Check for horizontal privilege escalation (user A accessing user B's data)
- Ensure directory listing is disabled

**A02 - Cryptographic Failures**
- No hardcoded secrets, keys, or passwords
- Sensitive data encrypted at rest and in transit
- Using modern algorithms (AES-256, bcrypt/argon2 for passwords)

**A03 - Injection**
- All SQL uses parameterized queries / ORM
- No eval(), exec(), or shell command construction with user input
- HTML output is escaped (XSS prevention)

**A05 - Security Misconfiguration**
- Debug mode disabled in production
- Default credentials changed
- Unnecessary features/endpoints disabled
- Error messages don't leak stack traces

**A07 - Auth & Session**
- Passwords hashed (bcrypt/argon2, never MD5/SHA1)
- Session tokens are random, invalidated on logout
- Rate limiting on login endpoints

**A09 - Logging**
- Log authentication events, failures, and admin actions
- Never log passwords or tokens

Report each finding with: severity, location, description, remediation."#.into(),
            source: "curated".into(),
            tags: vec!["security".into(), "owasp".into(), "audit".into(), "vulnerability".into()],
            github_url: None,
        },
        MarketplaceSkill {
            id: "curated-graphify".into(),
            name: "graphify".into(),
            display_name: "Graphify — Knowledge Graph".into(),
            description: "Convert any codebase, docs, or content into an interactive knowledge graph with community clusters.".into(),
            category: "planning".into(),
            author: "community".into(),
            stars: 445,
            content: r#"When asked to graphify content:

1. **Parse** the input (code AST, markdown headings, structured data)
2. **Extract entities**: files, functions, classes, concepts, terms
3. **Identify relationships**: imports, calls, references, similarities
4. **Cluster** related entities into communities using modularity
5. **Generate output**:
   - `GRAPH_REPORT.md`: god nodes, community overview, key relationships
   - `graph.json`: nodes and edges for visualization
   - `wiki/index.md`: human-readable index of communities

**Node types**: module, function, class, concept, term
**Edge types**: imports, calls, extends, references, similar-to

**Prioritize**: nodes with highest degree (most connections) are "god nodes" — document these first as they're the most impactful to understand.

Output the graph in a format compatible with D3.js force-directed layout."#.into(),
            source: "curated".into(),
            tags: vec!["knowledge-graph".into(), "visualization".into(), "analysis".into()],
            github_url: None,
        },
    ]
}

// ─── GitHub fetch ──────────────────────────────────────────────────────────────

async fn fetch_github_skills(query: &str) -> Vec<MarketplaceSkill> {
    let client = reqwest::Client::builder()
        .user_agent(format!(
            "Hopper/{} (https://github.com/Hopper)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(std::time::Duration::from_secs(10))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let search_url = format!(
        "https://api.github.com/search/repositories?q={}+topic:claude-code-skill&sort=stars&per_page=20",
        urlencoding_simple(query)
    );

    let response = client
        .get(&search_url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await;

    let response = match response {
        Ok(r) if r.status().is_success() => r,
        _ => return vec![],
    };

    let search: GithubSearchResponse = match response.json().await {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    search
        .items
        .into_iter()
        .map(|repo| {
            let category = infer_category_from_topics(&repo.topics);
            MarketplaceSkill {
                id: format!("github-{}", repo.id),
                name: repo.name.to_lowercase().replace(' ', "-"),
                display_name: repo.name.replace('-', " ").replace('_', " "),
                description: repo
                    .description
                    .unwrap_or_else(|| "No description".to_string()),
                category,
                author: repo.owner.login,
                stars: repo.stargazers_count,
                content: format!(
                    "# {}\n\nInstall this skill to use it. View source at: {}",
                    repo.full_name, repo.html_url
                ),
                source: "github".into(),
                tags: repo.topics,
                github_url: Some(repo.html_url),
            }
        })
        .collect()
}

fn infer_category_from_topics(topics: &[String]) -> String {
    let joined = topics.join(" ");
    if joined.contains("design") || joined.contains("ui") || joined.contains("css") {
        "design".into()
    } else if joined.contains("efficient") || joined.contains("token") || joined.contains("optim") {
        "efficiency".into()
    } else if joined.contains("plan") || joined.contains("task") || joined.contains("project") {
        "planning".into()
    } else if joined.contains("scrap") || joined.contains("crawl") || joined.contains("data") {
        "scraping".into()
    } else if joined.contains("devops") || joined.contains("ci") || joined.contains("docker") {
        "devops".into()
    } else if joined.contains("mcp") || joined.contains("server") {
        "mcp".into()
    } else {
        "code".into()
    }
}

fn urlencoding_simple(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => '+',
            c if c.is_alphanumeric() || c == '-' || c == '_' => c,
            _ => '_',
        })
        .collect()
}

// ─── Tauri commands ────────────────────────────────────────────────────────────

#[command]
pub async fn marketplace_search(
    query: String,
    category: Option<String>,
) -> Result<Vec<MarketplaceSkill>, String> {
    let mut skills = curated_skills();

    // Also try to fetch from GitHub (non-blocking — failures are silent)
    if !query.is_empty() || category.is_none() {
        let search_term = if query.is_empty() {
            "claude-code-skill".to_string()
        } else {
            query.clone()
        };
        let mut github_skills = fetch_github_skills(&search_term).await;
        skills.append(&mut github_skills);
    }

    // Filter by category
    if let Some(cat) = &category {
        if cat != "all" {
            skills.retain(|s| &s.category == cat);
        }
    }

    // Filter by query text
    if !query.is_empty() {
        let q = query.to_lowercase();
        skills.retain(|s| {
            s.display_name.to_lowercase().contains(&q)
                || s.description.to_lowercase().contains(&q)
                || s.tags.iter().any(|t| t.to_lowercase().contains(&q))
        });
    }

    // Sort: curated first, then by stars descending
    skills.sort_by(|a, b| {
        let a_curated = a.source == "curated";
        let b_curated = b.source == "curated";
        if a_curated != b_curated {
            b_curated.cmp(&a_curated)
        } else {
            b.stars.cmp(&a.stars)
        }
    });

    Ok(skills)
}

#[command]
pub async fn marketplace_install(args: InstallSkillArgs) -> Result<Vec<String>, String> {
    let home = dirs_home().ok_or("Could not determine home directory")?;
    let mut installed_providers = Vec::new();
    let mut errors = Vec::new();

    for provider in &args.providers {
        let install_path = match provider_install_path(&home, provider, &args.name) {
            Some(p) => p,
            None => {
                errors.push(format!("Unknown provider: {}", provider));
                continue;
            }
        };

        if let Some(parent) = install_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                errors.push(format!("{}: failed to create directory: {}", provider, e));
                continue;
            }
        }

        let formatted = format_skill_content(
            provider,
            &args.name,
            &args.display_name,
            &args.description,
            &args.author,
            &args.content,
        );

        match std::fs::write(&install_path, &formatted) {
            Ok(_) => {
                installed_providers.push(provider.clone());
            }
            Err(e) => {
                errors.push(format!("{}: write failed: {}", provider, e));
            }
        }
    }

    if !installed_providers.is_empty() {
        // Update registry
        let mut registry = load_installed(&home);
        let entry = registry
            .entry(args.skill_id.clone())
            .or_insert_with(|| InstalledSkill {
                id: args.skill_id.clone(),
                name: args.name.clone(),
                display_name: args.display_name.clone(),
                installed_providers: vec![],
            });
        for p in &installed_providers {
            if !entry.installed_providers.contains(p) {
                entry.installed_providers.push(p.clone());
            }
        }
        save_installed(&home, &registry);
    }

    if installed_providers.is_empty() {
        Err(errors.join("; "))
    } else {
        Ok(installed_providers)
    }
}

#[command]
pub async fn marketplace_installed() -> Result<Vec<InstalledSkill>, String> {
    let home = dirs_home().ok_or("Could not determine home directory")?;
    let registry = load_installed(&home);
    Ok(registry.into_values().collect())
}

#[command]
pub async fn marketplace_uninstall(
    skill_id: String,
    name: String,
    providers: Vec<String>,
) -> Result<(), String> {
    let home = dirs_home().ok_or("Could not determine home directory")?;

    for provider in &providers {
        if let Some(path) = provider_install_path(&home, provider, &name) {
            let _ = std::fs::remove_file(&path);
            // If it's a directory (claude-code), remove the dir
            if let Some(parent) = path.parent() {
                let _ = std::fs::remove_dir(parent);
            }
        }
    }

    // Update registry
    let mut registry = load_installed(&home);
    if let Some(entry) = registry.get_mut(&skill_id) {
        entry.installed_providers.retain(|p| !providers.contains(p));
        if entry.installed_providers.is_empty() {
            registry.remove(&skill_id);
        }
    }
    save_installed(&home, &registry);

    Ok(())
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from))
}
