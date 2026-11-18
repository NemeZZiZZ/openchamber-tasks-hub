// Pure form guard kept separate from the DOM dialog for regression tests.
// A non-title edit must never make an empty-title draft submittable.
export const detailCanSave = (title: string, changed: boolean): boolean =>
  title.trim() !== '' && changed;
