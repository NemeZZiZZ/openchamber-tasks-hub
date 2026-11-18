// Pure selection rules for the create dialog. Keeping the source/project
// pairing here prevents a default project filter from leaking across sources.
export type CreateSelection = { adapterId: string; projectRef: string | null };

export const resolveCreateSelection = (
  adapters: readonly { id: string }[],
  projectsByAdapter: Readonly<Record<string, string[]>>,
  defaults: { adapterId: string | null; projectRef: string | null },
): CreateSelection => {
  const adapterId = (adapters.find((a) => a.id === defaults.adapterId) ?? adapters[0])?.id ?? 'local';
  if (adapterId === 'local') return { adapterId, projectRef: null };
  const projects = projectsByAdapter[adapterId] ?? [];
  const projectRef = defaults.projectRef && projects.includes(defaults.projectRef)
    ? defaults.projectRef
    : projects[0] ?? null;
  return { adapterId, projectRef };
};

export const createFormValid = (
  adapterId: string,
  projectRef: string | null,
  title: string,
  projectsByAdapter: Readonly<Record<string, string[]>>,
): boolean => title.trim() !== ''
  && (adapterId === 'local' || (projectRef !== null && (projectsByAdapter[adapterId] ?? []).includes(projectRef)));
