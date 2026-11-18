export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export const clear = (node: Element) => { node.replaceChildren(); };

// Mount point for an SDK kit control (display:contents keeps layout flat).
export const slot = (className = 'tk-slot'): HTMLSpanElement => el('span', className);

// Anything with a dispose (kit handles, sub-views).
export type Disposable = { dispose: () => void };

// Owns kit handles so a re-render can release them together.
export class Scope {
  private items: Disposable[] = [];
  keep<T extends Disposable>(handle: T): T {
    this.items.push(handle);
    return handle;
  }
  reset(): void {
    for (const item of this.items.splice(0)) item.dispose();
  }
}

export const debounce = <A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
};

export const chevron = (dir: 'down' | 'right' = 'down'): HTMLElement => {
  const node = el('span', 'tk-chev');
  node.dataset.dir = dir;
  node.setAttribute('aria-hidden', 'true');
  return node;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
export const closeIcon = (size = 14): SVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M3.5 3.5l9 9M12.5 3.5l-9 9');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('fill', 'none');
  svg.append(path);
  return svg;
};

export const iconButton = (label: string, icon: Node, onClick: (event: MouseEvent) => void): HTMLButtonElement => {
  const button = el('button', 'tk-iconbtn');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(icon);
  button.addEventListener('click', onClick);
  return button;
};

const strokeIcon = (d: string, size: number): SVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('fill', 'none');
  svg.append(path);
  return svg;
};

export const plusIcon = (size = 14): SVGElement => strokeIcon('M8 3v10M3 8h10', size);
