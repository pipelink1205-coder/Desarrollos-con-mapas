/**
 * Burbuja informativa + toasts estilo Sileo (vanilla, accesible).
 * Uso: initSileoA11y({ variant: 'mapa' | 'admin' })
 */
(function () {
  const TEXT = {
    mapa: {
      toast:
        'Sitio accesible para lectores de pantalla (NVDA, JAWS, VoiceOver, TalkBack). Use el selector de comuna si no utiliza el mapa con el mouse.',
      titulo: 'Accesibilidad del directorio',
      cuerpo:
        'Este directorio está preparado para software lector de pantalla y navegación con teclado. ' +
        'Incluye etiquetas en formularios, anuncios al cambiar la zona o el listado, y un selector de comuna ' +
        'como alternativa al mapa. Compatible con NVDA y JAWS (Windows), VoiceOver (Mac e iPhone) y TalkBack (Android).',
    },
    admin: {
      toast:
        'Panel accesible para lectores de pantalla (NVDA, JAWS, VoiceOver, TalkBack). Formularios con etiquetas y avisos legibles.',
      titulo: 'Accesibilidad del panel',
      cuerpo:
        'Este panel de administración está preparado para software lector de pantalla y teclado. ' +
        'Los campos tienen etiquetas, las tablas son navegables y los avisos se anuncian al guardar o borrar. ' +
        'Compatible con NVDA y JAWS (Windows), VoiceOver (Mac e iPhone) y TalkBack (Android).',
    },
  };

  let toastRoot = null;

  function injectStyles() {
    if (document.getElementById('sileo-a11y-styles')) return;
    const s = document.createElement('style');
    s.id = 'sileo-a11y-styles';
    s.textContent = `
.hdr-l{position:relative}
.hdr-tit-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.hdr-tit-row h1{min-width:0;flex:1 1 auto}
.a11y-sello-chip{
  flex-shrink:0;
  display:inline-flex;align-items:center;gap:4px;
  font-size:9px;font-weight:700;letter-spacing:.02em;
  padding:3px 8px;border-radius:999px;cursor:pointer;
  border:1px solid rgba(52,211,153,.5);
  background:rgba(52,211,153,.18);color:#ecfdf5;
  transition:background .15s,transform .15s;
  font-family:inherit;line-height:1.2;
}
.a11y-sello-chip:hover,.a11y-sello-chip[aria-expanded="true"]{
  background:rgba(52,211,153,.32);transform:translateY(-1px);
}
.a11y-sello-chip .a11y-ico{font-size:11px;line-height:1}
.a11y-popover{
  position:absolute;top:calc(100% + 8px);left:0;right:0;
  max-width:min(340px,92vw);z-index:1300;
  background:#fff;color:#0f172a;
  border:1px solid #e2e8f0;border-radius:12px;
  padding:12px 14px 10px;
  box-shadow:0 16px 48px rgba(15,23,42,.22);
}
.a11y-popover[hidden]{display:none!important}
.a11y-popover-h{font-size:12px;font-weight:700;color:#1a3a5c;margin:0 0 6px;padding-right:24px;line-height:1.3}
.a11y-popover-p{font-size:11px;line-height:1.5;color:#475569;margin:0 0 8px}
.a11y-popover-list{margin:0 0 8px;padding-left:16px;font-size:10px;line-height:1.45;color:#64748b}
.a11y-popover-x{
  position:absolute;top:8px;right:8px;
  width:26px;height:26px;border:1px solid #e2e8f0;border-radius:6px;
  background:#f8fafc;cursor:pointer;font-size:14px;line-height:1;color:#64748b;
}
.a11y-popover-x:hover{background:#eff6ff;color:#1a3a5c}
.sileo-root{
  position:fixed;top:12px;right:12px;z-index:10050;
  display:flex;flex-direction:column;gap:8px;align-items:flex-end;
  pointer-events:none;max-width:min(380px,calc(100vw - 20px));
}
.sileo-toast{
  pointer-events:auto;display:flex;gap:10px;align-items:flex-start;
  background:rgba(255,255,255,.98);border:1px solid #e2e8f0;
  border-left:4px solid #059669;border-radius:14px;
  padding:11px 12px 11px 11px;
  box-shadow:0 12px 40px rgba(15,23,42,.16);
  animation:sileoIn .4s cubic-bezier(.21,1,.34,1);
}
.sileo-toast.is-out{animation:sileoOut .28s ease forwards}
.sileo-toast-ico{flex-shrink:0;font-size:18px;line-height:1.2}
.sileo-toast-body{flex:1;min-width:0}
.sileo-toast-t{font-size:11px;font-weight:700;color:#065f46;margin:0 0 3px}
.sileo-toast-p{font-size:11px;line-height:1.45;color:#334155;margin:0}
.sileo-toast-x{
  flex-shrink:0;border:none;background:transparent;
  width:24px;height:24px;border-radius:6px;cursor:pointer;
  font-size:16px;line-height:1;color:#94a3b8;
}
.sileo-toast-x:hover{background:#f1f5f9;color:#475569}
@keyframes sileoIn{
  from{opacity:0;transform:translateY(-14px) scale(.95)}
  to{opacity:1;transform:none}
}
@keyframes sileoOut{
  to{opacity:0;transform:translateY(-8px) scale(.97)}
}
@media (max-width:900px){
  .a11y-sello-chip{font-size:8px;padding:2px 6px;gap:3px}
  .a11y-popover{left:auto;right:0;max-width:min(300px,calc(100vw - 16px))}
  .sileo-root{top:max(8px,env(safe-area-inset-top));right:8px;left:8px;align-items:stretch;max-width:none}
}
`;
    document.head.appendChild(s);
  }

  function ensureToastRoot() {
    if (toastRoot) return toastRoot;
    toastRoot = document.createElement('div');
    toastRoot.id = 'sileo-root';
    toastRoot.className = 'sileo-root';
    toastRoot.setAttribute('aria-live', 'polite');
    toastRoot.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(toastRoot);
    return toastRoot;
  }

  function sileoDismiss(el, timer) {
    if (timer) clearTimeout(timer);
    if (!el?.parentNode) return;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 280);
  }

  function sileoShow(message, opts = {}) {
    const root = ensureToastRoot();
    const el = document.createElement('div');
    el.className = 'sileo-toast';
    el.setAttribute('role', 'status');
    const tit = opts.title || 'Accesible para lectores de pantalla';
    el.innerHTML =
      `<span class="sileo-toast-ico" aria-hidden="true">♿</span>` +
      `<div class="sileo-toast-body">` +
      `<p class="sileo-toast-t">${tit}</p>` +
      `<p class="sileo-toast-p">${message}</p>` +
      `</div>` +
      `<button type="button" class="sileo-toast-x" aria-label="Cerrar aviso">×</button>`;
    const btn = el.querySelector('.sileo-toast-x');
    let timer = setTimeout(() => sileoDismiss(el, timer), opts.duration || 9000);
    btn.addEventListener('click', () => sileoDismiss(el, timer));
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('focusin', () => clearTimeout(timer));
    root.appendChild(el);
    return el;
  }

  function mountChip(hdrL, cfg) {
    if (!hdrL || hdrL.querySelector('.a11y-sello-chip')) return;

    const titWrap = hdrL.querySelector('div:not(.hdr-logo)');
    if (!titWrap) return;

    const h1 = titWrap.querySelector('h1');
    if (!h1) return;

    let row = titWrap.querySelector('.hdr-tit-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'hdr-tit-row';
      titWrap.insertBefore(row, titWrap.firstChild);
      row.appendChild(h1);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a11y-sello-chip';
    btn.id = 'btn-a11y-info';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'a11y-popover');
    btn.setAttribute('aria-label', 'Información de accesibilidad para lectores de pantalla');
    btn.innerHTML = '<span class="a11y-ico" aria-hidden="true">♿</span> Accesible';

    const pop = document.createElement('div');
    pop.id = 'a11y-popover';
    pop.className = 'a11y-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-labelledby', 'a11y-popover-tit');
    pop.hidden = true;
    pop.innerHTML =
      `<button type="button" class="a11y-popover-x" aria-label="Cerrar información de accesibilidad">×</button>` +
      `<h2 class="a11y-popover-h" id="a11y-popover-tit">${cfg.titulo}</h2>` +
      `<p class="a11y-popover-p">${cfg.cuerpo}</p>` +
      `<ul class="a11y-popover-list">` +
      `<li>NVDA y JAWS (Windows)</li>` +
      `<li>VoiceOver (Mac e iPhone)</li>` +
      `<li>TalkBack (Android)</li>` +
      `</ul>`;

    row.appendChild(btn);
    hdrL.appendChild(pop);

    function cerrarPopover() {
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    function abrirPopover() {
      const abierto = !pop.hidden;
      if (abierto) {
        cerrarPopover();
        return;
      }
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      pop.querySelector('.a11y-popover-x')?.focus();
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirPopover();
    });
    pop.querySelector('.a11y-popover-x')?.addEventListener('click', cerrarPopover);
    document.addEventListener('click', (e) => {
      if (pop.hidden) return;
      if (pop.contains(e.target) || btn.contains(e.target)) return;
      cerrarPopover();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !pop.hidden) cerrarPopover();
    });
  }

  function initSileoA11y(opts) {
    injectStyles();
    const variant = opts?.variant === 'admin' ? 'admin' : 'mapa';
    const cfg = TEXT[variant];
    const hdrL = document.querySelector('.hdr-l');
    mountChip(hdrL, cfg);

    const key = `sileo-a11y-toast-${variant}`;
    if (!sessionStorage.getItem(key)) {
      setTimeout(() => {
        sileoShow(cfg.toast, { title: 'Sitio accesible' });
        sessionStorage.setItem(key, '1');
      }, 1200);
    }
  }

  window.initSileoA11y = initSileoA11y;
  window.sileoShow = sileoShow;
})();
