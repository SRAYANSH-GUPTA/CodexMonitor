import { buildGitNodes } from "./layoutNodes/buildGitNodes";
import type { GitLayoutNodesOptions } from "./layoutNodes/buildGitNodes";
import { buildPrimaryNodes } from "./layoutNodes/buildPrimaryNodes";
import type { PrimaryLayoutNodesOptions } from "./layoutNodes/buildPrimaryNodes";
import { buildSecondaryNodes } from "./layoutNodes/buildSecondaryNodes";
import type { SecondaryLayoutNodesOptions } from "./layoutNodes/buildSecondaryNodes";
import type { LayoutNodesOptions, LayoutNodesResult } from "./layoutNodes/types";

export function useLayoutNodes(options: LayoutNodesOptions): LayoutNodesResult {
  const primaryOptions: PrimaryLayoutNodesOptions = options.primary;
  const gitOptions: GitLayoutNodesOptions = options.git;
  const secondaryOptions: SecondaryLayoutNodesOptions = options.secondary;

  // Build git + secondary nodes first so we can inject panels into the sidebar
  const gitNodes = buildGitNodes(gitOptions);
  const secondaryNodes = buildSecondaryNodes(secondaryOptions);

  const primaryOptionsWithPanels: PrimaryLayoutNodesOptions = {
    ...primaryOptions,
    sidebarProps: {
      ...primaryOptions.sidebarProps,
      gitPanelNode: gitNodes.gitDiffPanelNode,
      planPanelNode: secondaryNodes.planPanelNode,
    },
  };

  return {
    ...buildPrimaryNodes(primaryOptionsWithPanels),
    ...gitNodes,
    ...secondaryNodes,
  };
}
