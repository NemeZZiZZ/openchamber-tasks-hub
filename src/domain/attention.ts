// Agent-activity → attention badge (v0.0.0): the agent never moves columns
// (design decision — it would fight the GitLab board); its live state only
// sets/clears the local needsAttentionSince badge. Pure: own narrow
// activity types, no SDK import.
export type AgentActivity = 'running' | 'retrying' | 'waiting-question' | 'waiting-permission' | 'idle' | string;
export type AgentOutcome = 'completed' | 'failed' | null;

export type AttentionView = { activity: AgentActivity; outcome: AgentOutcome };
export type AttentionAction = 'set' | 'clear' | 'keep';

/**
 * What the badge should do for this session snapshot. Waiting states and
 * turn ends set the badge (sticky until the agent runs again — a rerun
 * means the user answered); running clears it; anything unknown keeps it.
 */
export const attentionForSession = (session: AttentionView): AttentionAction => {
  switch (session.activity) {
    case 'running':
    case 'retrying':
      return 'clear';
    case 'waiting-question':
    case 'waiting-permission':
      return 'set';
    case 'idle':
      return session.outcome === 'completed' || session.outcome === 'failed' ? 'set' : 'keep';
    default:
      return 'keep';
  }
};
