/** Self-contained preview UI: a player that seeks the real scene documents frame by frame. */
export function previewPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>shipreel preview</title>
<style>
:root{--bg:#0f1115;--panel:#171a21;--line:#2a2f3a;--text:#e8eaf0;--muted:#9aa3b2;--accent:#8b5cf6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;height:100vh}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}
header h1{font-size:15px;margin:0;font-weight:650}
header .meta{color:var(--muted)}
.tabs{display:flex;gap:6px;margin-left:auto}
button{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
button:hover{border-color:var(--accent)}
button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
#stage{flex:1;position:relative;overflow:hidden;margin:16px}
#frame{position:absolute;left:50%;top:50%;transform-origin:0 0;box-shadow:0 20px 60px rgba(0,0,0,.5);background:#000}
#frame iframe{position:absolute;inset:0;border:0;visibility:hidden}
#frame iframe.active{visibility:visible}
footer{display:flex;align-items:center;gap:12px;padding:12px 20px;border-top:1px solid var(--line)}
input[type=range]{flex:1;accent-color:var(--accent)}
#time{font-variant-numeric:tabular-nums;color:var(--muted);min-width:110px;text-align:right}
#scenes{display:flex;gap:6px;padding:0 20px 14px;flex-wrap:wrap}
#scenes button{font-size:12px;padding:4px 10px}
#error{display:none;margin:20px;padding:16px;border:1px solid #f87171;border-radius:8px;color:#fecaca;white-space:pre-wrap}
</style>
</head>
<body>
<header>
  <h1 id="title">shipreel preview</h1>
  <span class="meta" id="meta"></span>
  <div class="tabs" id="sizes"></div>
  <button id="reload" title="Re-read config, notes and template files">Reload</button>
</header>
<div id="error"></div>
<div id="stage"><div id="frame"></div></div>
<footer>
  <button id="play" aria-label="Play">Play</button>
  <input id="scrub" type="range" min="0" value="0" step="1" aria-label="Timeline">
  <span id="time">0.00s</span>
</footer>
<div id="scenes"></div>
<script>
(function(){
  var plan, size, frames = [], current = 0, playing = false, lastTs = 0, fps = 30;
  var $ = function(id){ return document.getElementById(id); };
  var frameEl = $('frame'), scrub = $('scrub');

  function load(){
    return fetch('/plan.json', {cache:'no-store'}).then(function(r){
      if (!r.ok) return r.text().then(function(t){ throw new Error(t); });
      return r.json();
    }).then(function(p){
      $('error').style.display = 'none';
      plan = p; fps = p.timeline.fps;
      $('title').textContent = p.content.projectName + ' ' + (/^\\d/.test(p.content.version) ? 'v' : '') + p.content.version;
      $('meta').textContent = p.template + ' template · ' + p.timeline.durationSeconds.toFixed(1) + 's · ' + p.timeline.scenes.length + ' scenes · ' + fps + ' fps';
      scrub.max = String(p.timeline.totalFrames - 1);
      var sizes = $('sizes'); sizes.innerHTML = '';
      p.sizes.forEach(function(s){
        var b = document.createElement('button');
        b.textContent = s.name + ' ' + s.width + '×' + s.height;
        b.setAttribute('aria-pressed', String(size && size.name === s.name));
        b.onclick = function(){ size = s; build(); };
        sizes.appendChild(b);
      });
      if (!size || !p.sizes.some(function(s){ return s.name === size.name; })) size = p.sizes[0];
      var scenes = $('scenes'); scenes.innerHTML = '';
      p.timeline.scenes.forEach(function(s, i){
        var b = document.createElement('button');
        b.textContent = (i + 1) + '. ' + s.type + (s.type === 'highlight' ? ' ' + (s.index + 1) : '') + ' · ' + s.seconds.toFixed(1) + 's';
        b.onclick = function(){ seek(s.startFrame); };
        scenes.appendChild(b);
      });
      build();
    }).catch(function(e){ $('error').textContent = e.message; $('error').style.display = 'block'; });
  }

  function build(){
    Array.prototype.forEach.call($('sizes').children, function(b, i){ b.setAttribute('aria-pressed', String(plan.sizes[i].name === size.name)); });
    frameEl.innerHTML = '';
    frameEl.style.width = size.width + 'px';
    frameEl.style.height = size.height + 'px';
    frames = plan.timeline.scenes.map(function(s, i){
      var f = document.createElement('iframe');
      f.width = size.width; f.height = size.height;
      f.src = '/scene/' + encodeURIComponent(size.name) + '/' + i + '?t=' + Date.now();
      f.onload = function(){ seek(current); };
      frameEl.appendChild(f);
      return f;
    });
    fit(); seek(current);
  }

  function fit(){
    if (!size) return;
    var stage = $('stage').getBoundingClientRect();
    var scale = Math.min(stage.width / size.width, stage.height / size.height);
    frameEl.style.transform = 'scale(' + scale + ') translate(-50%, -50%)';
  }

  function seek(frame){
    if (!plan) return;
    current = Math.max(0, Math.min(plan.timeline.totalFrames - 1, Math.round(frame)));
    scrub.value = String(current);
    $('time').textContent = (current / fps).toFixed(2) + 's / ' + plan.timeline.durationSeconds.toFixed(2) + 's';
    plan.timeline.scenes.forEach(function(s, i){
      var active = current >= s.startFrame && current < s.startFrame + s.frames;
      var f = frames[i];
      if (!f) return;
      f.classList.toggle('active', active);
      if (active) {
        try { f.contentWindow.__shipreelSeek && f.contentWindow.__shipreelSeek((current - s.startFrame) / fps * 1000); } catch (e) {}
      }
    });
  }

  var currentFloat = 0;
  function tick(ts){
    if (!playing) return;
    if (lastTs) {
      currentFloat += (ts - lastTs) / 1000 * fps;
      if (currentFloat >= plan.timeline.totalFrames) currentFloat = 0;
      seek(currentFloat);
    }
    lastTs = ts;
    requestAnimationFrame(tick);
  }

  function toggle(){
    playing = !playing; lastTs = 0; currentFloat = current;
    $('play').textContent = playing ? 'Pause' : 'Play';
    if (playing) requestAnimationFrame(tick);
  }

  $('play').onclick = toggle;
  $('reload').onclick = load;
  scrub.oninput = function(){ if (playing) toggle(); seek(Number(scrub.value)); };
  window.addEventListener('resize', fit);
  document.addEventListener('keydown', function(e){
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight') seek(current + (e.shiftKey ? fps : 1));
    if (e.code === 'ArrowLeft') seek(current - (e.shiftKey ? fps : 1));
  });
  load();
})();
</script>
</body>
</html>`;
}
