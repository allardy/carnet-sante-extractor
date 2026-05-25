import { docStrings } from '../shared/i18n.js'

import { escapeHtml, renderMarkdown } from './html.js'
import { type Manifest } from './manifest.js'
import { type SectionDef, sectionName } from './sections.js'

export type DossierSection = { def: SectionDef; body: string }

// The per-section markdown bodies repeat their own H1 (the accordion already shows the title) and end
// with a "back to LISEZ-MOI / JSON" footer that makes no sense on a single page — strip both.
const stripChrome = (markdown: string): string => {
  const lines = markdown.split('\n')

  if (lines[0]?.startsWith('# ')) {
    lines.shift()

    while (lines[0] === '') {
      lines.shift()
    }
  }

  const hr = lines.lastIndexOf('---')

  if (hr !== -1) {
    lines.length = hr
  }

  return lines.join('\n').trimEnd()
}

const sidebar = (sections: DossierSection[], manifest: Manifest): string => {
  const d = docStrings[manifest.locale]
  const items = [`<li><a href="#overview" data-target="overview">${escapeHtml(d.overview)}</a></li>`]

  for (const { def } of sections) {
    const count = manifest.domains[def.key]?.count ?? 0
    const name = escapeHtml(sectionName(def.key, manifest.locale))

    items.push(
      `<li><a href="#${def.slug}" data-target="${def.slug}"><span>${name}</span><span class="badge">${count}</span></a></li>`,
    )
  }

  return `<nav class="sidebar" aria-label="${escapeHtml(d.overview)}"><ul>${items.join('')}</ul></nav>`
}

const overviewCard = (sections: DossierSection[], manifest: Manifest): string => {
  const d = docStrings[manifest.locale]
  const lines: string[] = []

  if (manifest.profile) {
    lines.push(
      d.generatedFor(manifest.profile.fullName, manifest.profile.citizenId, manifest.generatedAt.slice(0, 10)),
      '',
    )
  }

  lines.push(`| ${d.section} | ${d.count} |`, '| --- | --- |')

  for (const { def } of sections) {
    const info = manifest.domains[def.key]
    const count = info?.count ?? 0
    const warn = info && info.errors.length > 0 ? ' ⚠' : ''

    lines.push(`| [${sectionName(def.key, manifest.locale)}](#${def.slug}) | ${count}${warn} |`)
  }

  lines.push('', `_${d.documentsCount(manifest.documents.length)}_`, '')
  lines.push(`**${d.whatsInside}**`, '', `- ${d.legendDocuments}`, `- ${d.legendDonnees}`, `- ${d.legendCapture}`)

  return `<section class="card overview" id="overview">${renderMarkdown(lines.join('\n'))}</section>`
}

const sectionCard = ({ def, body }: DossierSection, manifest: Manifest): string => {
  const info = manifest.domains[def.key]
  const count = info?.count ?? 0
  const warn = info && info.errors.length > 0 ? '<span class="warn">⚠</span>' : ''
  const open = def.key === 'profile' ? ' open' : ''
  const name = escapeHtml(sectionName(def.key, manifest.locale))

  return `<section class="section" id="${def.slug}" data-key="${def.key}">
<details${open}>
<summary><span class="sec-title">${name}</span>${warn}<span class="badge">${count}</span><span class="chev" aria-hidden="true">›</span></summary>
<div class="body">${renderMarkdown(stripChrome(body))}</div>
</details>
</section>`
}

// The single self-contained, human-facing record: sticky search, sidebar TOC with counts, collapsible
// sections (collapsed by default to kill the scroll), light/dark toggle, and print-expands-everything.
export const dossierHtml = (sections: DossierSection[], manifest: Manifest): string => {
  const d = docStrings[manifest.locale]
  const title = escapeHtml(d.recordTitle)
  const subtitle = manifest.profile
    ? `<p class="subtitle">${escapeHtml(manifest.profile.fullName)} · ${escapeHtml(manifest.profile.citizenId)} · ${escapeHtml(manifest.generatedAt.slice(0, 10))}</p>`
    : ''
  const cards = sections.map((s) => sectionCard(s, manifest)).join('\n')

  return `<!doctype html>
<html lang="${manifest.locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
<div class="brand"><h1>${title}</h1>${subtitle}</div>
<div class="controls">
<input id="q" class="search" type="search" placeholder="${escapeHtml(d.search)}" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(d.search)}" />
<button id="toggle-all" class="ctl" data-expand="${escapeHtml(d.expandAll)}" data-collapse="${escapeHtml(d.collapseAll)}">${escapeHtml(d.expandAll)}</button>
<button id="theme" class="ctl icon" type="button" aria-label="${escapeHtml(d.theme)}" title="${escapeHtml(d.theme)}">◐</button>
</div>
</header>
<div class="layout">
${sidebar(sections, manifest)}
<main>
${overviewCard(sections, manifest)}
<p id="noresults" hidden>${escapeHtml(d.noResults)}</p>
${cards}
</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`
}

const CSS = `
*{box-sizing:border-box}
html{scroll-behavior:smooth}
:root{
--accent:#0d7d7d;--accent-weak:#0d7d7d1f;--bg:#f5f7f9;--surface:#fff;--surface-2:#eef1f5;
--text:#1b2430;--muted:#5b6675;--border:#e3e7ec;--mark:#ffe27a;
--shadow:0 1px 2px rgba(16,24,40,.04),0 6px 22px rgba(16,24,40,.07);--radius:14px}
:root[data-theme=dark]{--accent:#3ec1c1;--accent-weak:#3ec1c126;--bg:#0e1116;--surface:#161b22;--surface-2:#1c232c;
--text:#e6edf3;--muted:#9aa7b4;--border:#2a323c;--mark:#7a5b00;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.4)}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--accent:#3ec1c1;--accent-weak:#3ec1c126;--bg:#0e1116;
--surface:#161b22;--surface-2:#1c232c;--text:#e6edf3;--muted:#9aa7b4;--border:#2a323c;--mark:#7a5b00;
--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.4)}}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.55;-webkit-font-smoothing:antialiased}
.topbar{position:sticky;top:0;z-index:30;display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap;
padding:.7rem 1.25rem;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.brand h1{font-size:1.05rem;margin:0;letter-spacing:-.01em}
.brand .subtitle{margin:.15rem 0 0;font-size:.8rem;color:var(--muted)}
.controls{display:flex;gap:.5rem;align-items:center}
.search{appearance:none;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;
padding:.5rem 1rem;min-width:min(48vw,17rem);font-size:.9rem;outline:none;transition:border-color .15s,box-shadow .15s}
.search:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak)}
.ctl{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:.5rem .85rem;
font-size:.85rem;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.ctl:hover{background:var(--surface-2);border-color:var(--accent)}
.ctl.icon{width:2.4rem;padding:.5rem 0;text-align:center;font-size:1rem}
.layout{display:grid;grid-template-columns:15rem minmax(0,1fr);gap:1.5rem;max-width:74rem;margin:1.5rem auto;padding:0 1.25rem}
.sidebar{position:sticky;top:4.7rem;align-self:start;max-height:calc(100vh - 6rem);overflow:auto}
.sidebar ul{list-style:none;margin:0;padding:0}
.sidebar a{display:flex;justify-content:space-between;gap:.5rem;align-items:center;padding:.45rem .7rem;margin-bottom:.1rem;
border-radius:9px;color:var(--muted);text-decoration:none;font-size:.88rem;transition:background .12s,color .12s}
.sidebar a:hover{background:var(--surface-2);color:var(--text)}
.sidebar a.active{background:var(--accent-weak);color:var(--accent);font-weight:600}
.badge{font-size:.72rem;background:var(--surface-2);color:var(--muted);border-radius:999px;padding:.08rem .5rem;min-width:1.6rem;text-align:center}
.sidebar a.active .badge{background:var(--accent);color:#fff}
main{min-width:0}
.card,.section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:1rem}
.section{scroll-margin-top:4.8rem;overflow:hidden}
.overview{padding:1.1rem 1.5rem}
.overview>:first-child{margin-top:0}
.overview>:last-child{margin-bottom:0}
details>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:.7rem;padding:1rem 1.4rem;
font-weight:600;font-size:1.05rem;user-select:none}
details>summary::-webkit-details-marker{display:none}
.sec-title{margin-right:.2rem}
summary .warn{color:#d97706}
summary .badge{margin-left:auto}
summary .chev{color:var(--muted);transition:transform .2s ease;font-size:1.1rem}
details[open] summary .chev{transform:rotate(90deg)}
summary:hover{background:var(--surface-2)}
.body{padding:.1rem 1.5rem 1.3rem}
.body>:first-child{margin-top:.4rem}
.body h2{font-size:1rem;margin:1.4rem 0 .5rem;padding-bottom:.3rem;border-bottom:1px solid var(--border)}
.body h3{font-size:.95rem;margin:1.1rem 0 .35rem;color:var(--text)}
.body p{margin:.45rem 0}
.body ul{margin:.4rem 0;padding-left:1.25rem}
.body li{margin:.18rem 0}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:.88rem}
th,td{border:1px solid var(--border);padding:.45rem .65rem;text-align:left;vertical-align:top}
th{background:var(--surface-2);font-weight:600}
tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface-2) 45%,transparent)}
code{background:var(--surface-2);padding:.12rem .4rem;border-radius:6px;font-size:.85em}
em{color:var(--muted)}
mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 .12em}
hr{border:0;border-top:1px solid var(--border);margin:1.4rem 0}
#noresults{padding:2.5rem 1rem;text-align:center;color:var(--muted);font-size:1rem}
@media(max-width:820px){.layout{grid-template-columns:1fr;gap:1rem}.sidebar{display:none}}
@media print{.topbar,.sidebar{display:none}.layout{display:block;max-width:none;margin:0;padding:0}
.card,.section{box-shadow:none;break-inside:avoid}details>.body{display:block!important}summary .chev{display:none}}
`.trim()

// No backticks below — this string is itself a template literal.
const SCRIPT = `
(function(){
var root=document.documentElement,KEY='carnet-theme';
try{var st=localStorage.getItem(KEY);if(st)root.setAttribute('data-theme',st)}catch(e){}
var tBtn=document.getElementById('theme');
if(tBtn)tBtn.addEventListener('click',function(){
var dark=root.getAttribute('data-theme')==='dark'||(root.getAttribute('data-theme')!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
var next=dark?'light':'dark';root.setAttribute('data-theme',next);try{localStorage.setItem(KEY,next)}catch(e){}});
var norm=function(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')};
var esc=function(s){return s.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&')};
var secs=[].slice.call(document.querySelectorAll('.section'));
secs.forEach(function(sec){var b=sec.querySelector('.body');if(b)sec._html=b.innerHTML;sec._text=norm(sec.textContent);sec._open=sec.querySelector('details').open});
var overview=document.getElementById('overview'),noRes=document.getElementById('noresults'),input=document.getElementById('q');
var nav={};[].slice.call(document.querySelectorAll('.sidebar a[data-target]')).forEach(function(a){nav[a.getAttribute('data-target')]=a});
var highlight=function(el,raw){if(!raw)return;var re;try{re=new RegExp('('+esc(raw)+')','gi')}catch(e){return}
var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null),ns=[],n;while((n=w.nextNode())){if(n.nodeValue&&re.test(n.nodeValue))ns.push(n)}
ns.forEach(function(node){var sp=document.createElement('span');sp.innerHTML=node.nodeValue.replace(re,'<mark>$1</mark>');node.parentNode.replaceChild(sp,node)})};
var reset=function(){secs.forEach(function(sec){sec.style.display='';var b=sec.querySelector('.body');if(b&&sec._html!=null)b.innerHTML=sec._html;
sec.querySelector('details').open=sec._open;[].slice.call(sec.querySelectorAll('tr,li')).forEach(function(r){r.style.display=''})});
if(overview)overview.style.display='';if(nav.overview)nav.overview.parentNode.style.display='';if(noRes)noRes.hidden=true};
var run=function(raw){var q=norm(raw.trim());if(!q){reset();return}
if(overview)overview.style.display='none';if(nav.overview)nav.overview.parentNode.style.display='none';
var any=false;secs.forEach(function(sec){var b=sec.querySelector('.body');if(b&&sec._html!=null)b.innerHTML=sec._html;
var hit=sec._text.indexOf(q)!==-1;sec.style.display=hit?'':'none';var nv=nav[sec.id];if(nv)nv.parentNode.style.display=hit?'':'none';
if(!hit)return;any=true;sec.querySelector('details').open=true;
[].slice.call(sec.querySelectorAll('tbody tr')).forEach(function(tr){tr.style.display=norm(tr.textContent).indexOf(q)!==-1?'':'none'});
[].slice.call(sec.querySelectorAll('.body > ul > li')).forEach(function(li){li.style.display=norm(li.textContent).indexOf(q)!==-1?'':'none'});
if(b)highlight(b,raw.trim())});if(noRes)noRes.hidden=any};
var t;if(input)input.addEventListener('input',function(){clearTimeout(t);var v=input.value;t=setTimeout(function(){run(v)},120)});
var allBtn=document.getElementById('toggle-all');
if(allBtn)allBtn.addEventListener('click',function(){var anyClosed=secs.some(function(s){return !s.querySelector('details').open});
secs.forEach(function(s){s.querySelector('details').open=anyClosed});allBtn.textContent=anyClosed?allBtn.getAttribute('data-collapse'):allBtn.getAttribute('data-expand')});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href^="#"]'):null;if(!a)return;
var id=a.getAttribute('href').slice(1);if(!id)return;var tgt=document.getElementById(id);if(!tgt)return;e.preventDefault();
var det=tgt.querySelector('details');if(det)det.open=true;tgt.scrollIntoView({behavior:'smooth',block:'start'})});
if('IntersectionObserver' in window){var obs=new IntersectionObserver(function(es){es.forEach(function(en){var nv=nav[en.target.id];if(!nv)return;
if(en.isIntersecting){Object.keys(nav).forEach(function(k){nav[k].classList.remove('active')});nv.classList.add('active')}})},{rootMargin:'-30% 0px -60% 0px'});
secs.forEach(function(s){obs.observe(s)})}
var pState=null;addEventListener('beforeprint',function(){pState=secs.map(function(s){return s.querySelector('details').open});
secs.forEach(function(s){s.querySelector('details').open=true})});
addEventListener('afterprint',function(){if(pState)secs.forEach(function(s,i){s.querySelector('details').open=pState[i]})});
})();
`.trim()
