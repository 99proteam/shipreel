/**
 * CSS and JS injected into every scene document before the template's own files.
 * Templates can rely on the variables and helpers documented in docs/templates.md.
 */
export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden}
body{font-family:var(--font),system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-kerning:normal}
.scene{position:absolute;inset:0;overflow:hidden;
  animation:sr-scene-in .35s ease-out both,sr-scene-out .35s ease-in calc(var(--duration) - .35s) forwards}
.scene.sr-first{animation:sr-scene-out .35s ease-in calc(var(--duration) - .35s) forwards}
.scene.sr-last{animation:sr-scene-in .35s ease-out both}
.scene.sr-first.sr-last{animation:none}
.sr-word,.sr-char{display:inline-block;white-space:pre}
.sr-char{display:inline}
.sr-icon svg{width:100%;height:100%;display:block}
@keyframes sr-scene-in{from{opacity:0}to{opacity:1}}
@keyframes sr-scene-out{from{opacity:1}to{opacity:0}}
@property --sr-count{syntax:'<integer>';inherits:true;initial-value:0}
.sr-counter{counter-reset:sr-count var(--sr-count)}
.sr-counter::after{content:counter(sr-count)}
`;

/**
 * - `data-split="words|chars"` wraps each word/char in a span with `--i` (its index) and sets `--n`
 *   on the parent, so CSS can stagger animations with `animation-delay: calc(var(--i) * 60ms)`.
 * - `window.__shipreelSeek(ms)` pauses every animation and seeks it to `ms`, which makes frame
 *   rendering deterministic. The preview page uses the same function.
 */
export const RUNTIME_JS = `
(function(){
  document.querySelectorAll('[data-split]').forEach(function(el){
    var mode = el.getAttribute('data-split') === 'chars' ? 'chars' : 'words';
    var text = el.textContent || '';
    el.textContent = '';
    el.setAttribute('aria-label', text);
    var parts = mode === 'chars' ? Array.from(text) : text.split(/(\\s+)/);
    var i = 0;
    parts.forEach(function(part){
      if (!part) return;
      if (/^\\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); return; }
      var span = document.createElement('span');
      span.className = mode === 'chars' ? 'sr-char' : 'sr-word';
      span.style.setProperty('--i', String(i++));
      span.textContent = part;
      el.appendChild(span);
    });
    el.style.setProperty('--n', String(i));
  });
  window.__shipreelSeek = function(ms){
    var animations = document.getAnimations();
    for (var k = 0; k < animations.length; k++) { animations[k].pause(); animations[k].currentTime = ms; }
    return animations.length;
  };
  window.__shipreelSeek(0);
  window.__shipreelReady = true;
})();
`;
