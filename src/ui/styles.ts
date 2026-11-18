// Host theme only: every color comes from the host's --oc-* tokens (with
// color-mix fallbacks), controls come from the SDK UI kit. Responsive via
// data-size ("s" < 420px, "m" < 720px, "l") measured on the shell root.
const line = 'var(--oc-border,color-mix(in srgb,currentColor 18%,transparent))';
const muted = 'var(--oc-muted,color-mix(in srgb,currentColor 60%,transparent))';
const hover = 'var(--oc-hover,color-mix(in srgb,currentColor 8%,transparent))';
const surface = 'var(--oc-muted-surface,color-mix(in srgb,currentColor 5%,transparent))';
const card = 'var(--oc-elevated,var(--oc-bg,canvas))';
const radius = 'var(--oc-radius,9px)';
const mono = 'var(--oc-mono,ui-monospace,monospace)';

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--oc-bg);color:var(--oc-fg);font-family:var(--oc-font);font-size:13px;line-height:1.45}
#root{height:100%}
[hidden]{display:none!important}
.tk{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0}
.tk-slot{display:contents}
.tk-muted{color:${muted};font-size:12px}
.tk-mono{font:12px ${mono};color:${muted}}
.tk-grow{flex:1 1 auto;min-width:0}
.tk-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tk-fbar{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-bottom:1px solid ${line};flex:0 0 auto}
.tk-fbar-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.tk-fbar-row>.tk-search{flex:1 1 160px;min-width:120px}
.tk-fbar-row>.tk-pill{flex:0 1 auto;min-width:0}
.tk[data-size="s"] .tk-fbar-row>.tk-pill{flex:1 1 120px}
.tk-status{font-size:11px;color:${muted};display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.tk-dot{width:7px;height:7px;border-radius:99px;background:var(--oc-success);flex:0 0 auto}
.tk-dot[data-tone="busy"]{background:var(--oc-warning);animation:tk-pulse 1s ease-in-out infinite}
.tk-dot[data-tone="error"]{background:var(--oc-error)}
@keyframes tk-pulse{50%{opacity:.35}}
.tk-note{margin:8px 12px 0;padding:7px 10px;border:1px solid ${line};border-radius:${radius};font-size:12px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex:0 0 auto}
.tk-note[data-tone="error"]{border-color:var(--oc-error)}
.tk-note[data-tone="warning"]{border-color:var(--oc-warning)}
.tk-note-x{all:unset;cursor:pointer;color:${muted};padding:0 4px;line-height:1;font-size:15px}
.tk-note-x:hover{color:var(--oc-fg)}
.tk-view{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px 14px}
.tk-view[data-view="kanban"]{display:flex;padding-bottom:10px;overflow:hidden}
.tk-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 16px;text-align:center;color:${muted}}
.tk-empty b{color:var(--oc-fg);font-weight:600}

.tk-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:16px;border:1px solid ${line};border-radius:99px;padding:0 7px;color:${muted};white-space:nowrap;max-width:100%}
.tk-badge[data-tone="warning"]{border-color:var(--oc-warning);color:var(--oc-warning-text,var(--oc-fg))}
.tk-badge[data-tone="error"]{border-color:var(--oc-error);color:var(--oc-error-text,var(--oc-fg))}
.tk-badge[data-tone="info"]{border-color:var(--oc-info);color:var(--oc-info-text,var(--oc-fg))}
.tk-label{display:inline-flex;align-items:center;font-size:11px;line-height:16px;border-radius:99px;padding:0 7px;color:var(--oc-fg);background:color-mix(in srgb,var(--c,var(--oc-primary)) 18%,transparent);border:1px solid color-mix(in srgb,var(--c,var(--oc-primary)) 45%,transparent);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.tk-avatar{width:20px;height:20px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;background:${surface};border:1px solid ${line};color:${muted};flex:0 0 auto}
.tk-src{font-size:11px;color:${muted};display:inline-flex;align-items:center;gap:5px}
.tk-src::before{content:"";width:6px;height:6px;border-radius:2px;background:var(--c,${muted})}

.tk-chev{display:inline-block;width:7px;height:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(45deg);margin:0 2px 2px}
.tk-chev[data-dir="right"]{transform:rotate(-45deg);margin:0 2px 0 0}
.tk-iconbtn{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;color:${muted};flex:0 0 auto}
.tk-iconbtn:hover{background:${hover};color:var(--oc-fg)}
.tk-iconbtn:focus-visible{outline:2px solid var(--oc-focus,currentColor)}

.tk-list{display:flex;flex-direction:column;gap:6px}
.tk-item{display:flex;flex-direction:column;gap:5px;padding:9px 11px;border:1px solid ${line};border-radius:${radius};background:${card};cursor:pointer;min-width:0}
.tk-item:hover{background:${hover}}
.tk-item:focus-visible{outline:2px solid var(--oc-focus,currentColor)}
.tk-item[data-attn="1"]{border-left:3px solid var(--oc-warning)}
.tk-item-top{display:flex;align-items:center;gap:8px;min-width:0}
.tk-item-title{font-weight:550;font-size:13px;overflow-wrap:anywhere;flex:1 1 auto;min-width:0}
.tk-item-sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font-size:11px;color:${muted}}
.tk-err{font-size:12px;color:var(--oc-error-text,var(--oc-error));overflow-wrap:anywhere}
.tk-pillbtn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--oc-fg);white-space:nowrap}
.tk-pillbtn:hover{background:color-mix(in srgb,var(--c) 24%,transparent)}

.tk-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
.tk-table th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:${muted};text-align:left;padding:6px 8px;border-bottom:1px solid ${line};white-space:nowrap}
.tk-table td{padding:8px;border-bottom:1px solid ${line};vertical-align:middle;min-width:0;overflow:hidden}
.tk-table tbody tr{cursor:pointer}
.tk-table tbody tr:hover{background:${hover}}
.tk-table td.tk-cell-title{overflow:visible}
.tk-cell-clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}

.tk-columns{display:flex;gap:10px;align-items:stretch;overflow-x:auto;overflow-y:hidden;flex:1 1 auto;min-height:0;padding-bottom:4px}
.tk-column{flex:0 0 272px;width:272px;display:flex;flex-direction:column;min-height:0;background:${surface};border:1px solid ${line};border-top:3px solid var(--c);border-radius:${radius}}
.tk[data-size="s"] .tk-column{flex-basis:84%;width:84%}
.tk-column.tk-dragover{outline:2px solid var(--oc-focus,currentColor);outline-offset:-2px}
.tk-column-head{display:flex;align-items:center;gap:6px;padding:8px 8px 8px 6px;cursor:grab}
.tk-column-count{margin-left:auto;font-size:11px;color:${muted};display:inline-flex;align-items:center;gap:4px}
.tk-column-body{display:flex;flex-direction:column;gap:7px;padding:2px 8px 10px;overflow-y:auto;flex:1 1 auto;min-height:48px}
.tk-column-empty{font-size:12px;color:${muted};text-align:center;padding:14px 4px;border:1px dashed ${line};border-radius:${radius}}
.tk-column.tk-collapsed{flex:0 0 44px;width:44px;align-items:center;padding:8px 0;gap:10px;cursor:pointer}
.tk-column.tk-collapsed:hover{background:${hover}}
.tk-collapsed-title{writing-mode:vertical-rl;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:600;max-height:240px}
.tk-collapsed-count{font-size:11px;color:${muted}}
.tk-card{display:flex;flex-direction:column;gap:7px;padding:9px 10px;border:1px solid ${line};border-radius:${radius};background:${card};cursor:pointer;min-width:0}
.tk-card:hover{background:${hover}}
.tk-card:focus-visible{outline:2px solid var(--oc-focus,currentColor)}
.tk-card.tk-dragging{opacity:.4}
.tk-card[data-attn="1"]{border-left:3px solid var(--oc-warning)}
.tk-card-foot{display:flex;align-items:center;gap:8px;min-width:0;font-size:11px;color:${muted}}

.tk-overlay{position:fixed;inset:0;z-index:50;background:color-mix(in srgb,var(--oc-bg,#000) 55%,transparent);backdrop-filter:blur(1px);display:flex;align-items:flex-start;justify-content:center;padding:max(12px,4vh) 12px 12px;overflow:hidden}
.tk-dialog{display:flex;flex-direction:column;width:100%;max-width:620px;max-height:100%;min-height:0;background:${card};color:var(--oc-elevated-fg,var(--oc-fg));border:1px solid ${line};border-radius:calc(${radius} + 3px);box-shadow:0 18px 50px color-mix(in srgb,#000 35%,transparent)}
.tk-dialog-head{display:flex;align-items:flex-start;gap:10px;padding:12px 12px 10px 16px;border-bottom:1px solid ${line};flex:0 0 auto}
.tk-dialog-title{flex:1 1 auto;min-width:0;margin:0;font-size:15px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.tk-dialog-body{display:flex;flex-direction:column;gap:14px;padding:14px 16px;overflow-y:auto;min-height:0;flex:1 1 auto}
.tk-dialog-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:10px 16px;border-top:1px solid ${line};flex:0 0 auto}
.tk-field-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:${muted};margin-bottom:4px}
.tk-meta{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12px;color:${muted}}
.tk-meta a{color:var(--oc-primary-text,var(--oc-primary));text-decoration:none}
.tk-meta a:hover{text-decoration:underline}
.tk-radio{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid ${line};border-radius:${radius};cursor:pointer;font:12px ${mono};overflow-wrap:anywhere}
.tk-radio:hover{background:${hover}}
.tk-radio:has(input:checked){border-color:var(--oc-primary);background:${surface}}

.tk-rail{display:flex;flex-direction:column;gap:12px;padding:12px;height:100%;overflow:auto}
.tk-rail-head{display:flex;align-items:center;gap:8px}
.tk-rail-head h2{margin:0;font-size:14px;font-weight:600;flex:1}
.tk-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:6px}
.tk-stat{border:1px solid ${line};border-radius:${radius};background:${card};padding:7px 9px;display:flex;flex-direction:column;gap:1px}
.tk-stat b{font-size:17px;font-weight:600}
.tk-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:${muted}}
.tk-card-top{display:flex;align-items:flex-start;gap:4px;min-width:0}
.tk-card-top .tk-item-title{flex:1 1 auto;min-width:0}
.tk-card-menu{display:inline-flex;flex:0 0 auto;margin:-3px -4px 0 0}
.tk-chip{display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:0 6px;border-radius:99px;border:1px solid ${line};color:${muted};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-chip[data-tone="error"]{color:var(--oc-error-text,var(--oc-error));border-color:color-mix(in srgb,var(--oc-error) 50%,transparent)}
.tk-chip[data-tone="success"]{color:var(--oc-success-text,var(--oc-success));border-color:color-mix(in srgb,var(--oc-success) 50%,transparent)}
.tk-toggle-on{background:${hover}}
.tk-form{display:flex;flex-direction:column;gap:10px}
`;

export const injectStyles = () => {
  if (document.getElementById('tk-style')) return;
  const style = document.createElement('style');
  style.id = 'tk-style';
  style.textContent = CSS;
  document.head.append(style);
};

export const SMALL_PX = 420;
export const WIDE_PX = 720;
