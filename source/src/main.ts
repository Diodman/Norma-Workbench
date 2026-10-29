import './style.css';
import {createIcons,Network,Search,ArrowUpRight,ChevronRight,ChevronDown,ChevronLeft,Box,Layers,FileText,GitBranch,Download,Upload,SlidersHorizontal,Maximize,Plus,Minus,Crosshair,X,Check,Info,AlertTriangle,ExternalLink,Code,ArrowRight,Route,BookOpen,PanelLeftClose,Menu,RotateCcw,Clipboard,CheckCheck,FolderOpen,MessageSquare,Filter,Braces,Database} from 'lucide';
import {CATEGORY,GROUPS,PREDICATES,ingest,searchNodes,shortestPath,toWorkbench,fromWorkbench} from './core/ingest.mjs';
import {GraphDataLoader,type GraphData} from './vendor/graphData';
import {GraphView} from './graph-view';
import type {Graph,Node,Edge} from './types';

const icons={Network,Search,ArrowUpRight,ChevronRight,ChevronDown,ChevronLeft,Box,Layers,FileText,GitBranch,Download,Upload,SlidersHorizontal,Maximize,Plus,Minus,Crosshair,X,Check,Info,AlertTriangle,ExternalLink,Code,ArrowRight,Route,BookOpen,PanelLeftClose,Menu,RotateCcw,Clipboard,CheckCheck,FolderOpen,MessageSquare,Filter,Braces,Database};
const icon=(name:string,cls='')=>`<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const esc=(value:any)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const drawIcons=()=>createIcons({icons,attrs:{'stroke-width':1.7}});
const fmt=(n:number)=>n.toLocaleString('ru-RU');
let graph:Graph,original:Graph,upstream:GraphData|undefined,viewer:GraphView;
let group='document',view='graph',selected='',selectedTab='details',search='',reqSearch='',reqForce='all',sourceTab='files';
let categories=new Set(Object.keys(CATEGORY).filter(c=>!['schema','external'].includes(c))),pathNodes=new Set<string>();
let webgl=true,mode2D=false,labelMode=true,searchIndex=0;
const app=$('#app');
const lookup=()=>new Map(graph.nodes.map(n=>[n.id,n]));
const nodeById=(id:string)=>graph.nodes.find(n=>n.id===id);
const baseNodes=()=>graph.nodes.filter(n=>group==='all'||n.group===group);
const nodeButton=(n:Node,extra='')=>`<button class="node-link ${extra}" data-node="${esc(n.id)}"><span class="dot" style="--dot:${(CATEGORY as any)[n.category]?.color??'#8dabb8'}"></span><span>${esc(n.label)}</span>${icon('chevron-right')}</button>`;
const linkFor=(file:string)=>graph.meta.imported?'':`${graph.meta.repository??'https://github.com/f0k3s/dissertation'}/blob/${graph.meta.commit??'main'}/${file.split('/').map(encodeURIComponent).join('/')}`;
function scalar(value:any):string {
  if(value===null||value===undefined)return '—';
  if(Array.isArray(value))return value.map(scalar).join(', ');
  if(typeof value==='object') {
    if(value.numericValue!==undefined)return `${String(value.numericValue).replace('.',',')} ${scalar(value.unit??value.hasUnit??'')}`.trim();
    if(value.minValue!==undefined||value.maxValue!==undefined)return `${value.minValue??'…'}–${value.maxValue??'…'} ${scalar(value.unit??'')}`.trim();
    return value['@value']??value.label??value['rdfs:label']??JSON.stringify(value);
  }
  if(typeof value==='boolean')return value?'да':'нет';
  const n=graph.nodes.find(n=>n.sourceId===value&&n.group===(nodeById(selected)?.group??'document'))??graph.nodes.find(n=>n.sourceId===value);
  return n?.raw.symbol??n?.label??String(value);
}
const operators:Record<string,string>={'>=':'≥','<=':'≤','in':'одно из','markPattern':'шаблон','allowedForUse':'разрешено','mayBeAbsent':'может отсутствовать','=':'='};
const forces:Record<string,string>={mandatory:'Обязательное',permitted:'Допускается',informative:'Справочное',recommended:'Рекомендуется',prohibited:'Запрещено'};
function related(n:Node,predicate:string):Node[] {const map=lookup();return graph.edges.filter(e=>e.source===n.id&&e.predicate===predicate).map(e=>map.get(e.target)!).filter(Boolean);}
function requirementValue(n:Node){const r=n.raw;if(r.hasOperator==='mayBeAbsent'&&r.hasValue===true)return 'допускается отсутствие';if(r.hasOperator==='allowedForUse'&&r.hasValue==='foundation_application')return 'разрешено применение для фундаментов';return `${operators[r.hasOperator]??r.hasOperator??''} ${r.hasValue===undefined?(r.verifiedBy?scalar(r.verifiedBy):'значение не задано'):scalar(r.hasValue)}`.trim();}
function requirementNodes(){return graph.nodes.filter(n=>!n.external&&n.category==='requirement'&&(group==='all'||n.group===group));}
function sourceFragment(n:Node){return related(n,'statedIn')[0];}
function evidence(n:Node) {
 const f=sourceFragment(n);if(!f)return '<div class="muted small">Ссылка на фрагмент не задана.</div>';
 return `<div class="evidence"><div class="eyebrow">${icon('book-open')} ИСТОЧНИК В МОДЕЛИ</div><button class="evidence-title" data-node="${esc(f.id)}">ГОСТ 13579-2018 · ${esc(f.label)} ${icon('arrow-up-right')}</button><p>${esc(f.raw.textQuote??f.label)}</p><div class="muted small">${f.raw.pageStart?`Стр. ${esc(f.raw.pageStart)}${f.raw.pageEnd&&f.raw.pageEnd!==f.raw.pageStart?'–'+esc(f.raw.pageEnd):''} · `:''}Текст из набора данных</div></div>`;
}
function shell() {
 app.innerHTML=`
 <aside class="sidebar" id="sidebar">
  <a class="brand" href="#" aria-label="Норма, главная" data-action="home"><span class="brand-mark">${icon('network')}</span><div>норма<span>RESEARCH WORKBENCH</span></div></a>
  <div class="project-card"><div class="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</div><div class="project-name">${icon('box')} Диссертация <span class="live-dot"></span></div><div class="project-subtitle">Строительные нормативы</div></div>
  <nav aria-label="Основная навигация">
   <button class="nav-item active" data-view="graph">${icon('network')} Граф знаний <span class="nav-count" id="nav-count"></span></button>
   <button class="nav-item" data-view="requirements">${icon('list-filter')}<span class="icon-fix">${icon('sliders-horizontal')}</span> Требования <span class="nav-count" id="req-count">15</span></button>
   <button class="nav-item" data-view="facts">${icon('message-square')} Поиск фактов</button>
   <button class="nav-item" data-view="sources">${icon('folder-open')} Источники <span class="nav-count" id="nav-sources-count">21</span></button>
  </nav>
  <div class="side-section"><div class="side-heading">СЛОЙ ДАННЫХ ${icon('layers')}</div><div id="group-controls"></div></div>
  <div class="side-section categories-section"><div class="side-heading">ТИПЫ СУЩНОСТЕЙ <button class="plain tiny" data-action="all-categories" title="Показать все типы">Все</button></div><div id="category-controls"></div></div>
  <div class="sidebar-bottom"><div class="source-status">${icon('git-branch')} <span id="commit-label"></span><span class="status-point"></span></div><a href="https://github.com/f0k3s/dissertation" target="_blank" rel="noopener noreferrer">f0k3s / dissertation ${icon('arrow-up-right')}</a><button data-action="about">${icon('info')} О приложении и данных</button></div>
 </aside>
 <button class="sidebar-scrim" data-action="menu" aria-label="Закрыть меню"></button>
 <main class="main">
  <header class="topbar"><div class="breadcrumb"><button class="mobile-menu icon-button" data-action="menu" aria-label="Открыть меню">${icon('menu')}</button><span>Диссертация</span>${icon('chevron-right')}<strong id="breadcrumb-view">Граф знаний</strong></div><div class="top-actions"><button class="button quiet" data-action="import" aria-label="Импорт">${icon('upload')}<span>Импорт</span></button><button class="button primary" data-action="export">${icon('download')}<span>Экспорт графа</span></button></div></header>
  <section class="page-heading"><div><div class="eyebrow" id="heading-eyebrow">СЕМАНТИЧЕСКАЯ МОДЕЛЬ</div><h1 id="view-title">Нормативный граф<span class="version-badge">v1.0</span></h1><p id="view-subtitle">ГОСТ 13579-2018 · Блоки бетонные для стен подвалов</p></div><div class="dataset-stats"><div><strong id="stat-nodes">—</strong><span>узлов в слое</span></div><div><strong id="stat-edges">—</strong><span>связей</span></div><div><strong id="stat-files">—</strong><span>файлов</span></div></div></section>
  <div class="workspace">
   <section class="content-area">
    <section class="view graph-page" id="graph-page">
     <div class="graph-toolbar"><div class="search-wrapper">${icon('search')}<input id="entity-search" placeholder="Найти сущность, требование, ID…" autocomplete="off" aria-label="Поиск сущностей" role="combobox" aria-controls="search-results" aria-expanded="false"/><kbd>Ctrl K</kbd><div id="search-results" class="search-results" role="listbox" hidden></div></div><button class="button quiet route-button" data-action="path" aria-label="Найти связь">${icon('route')}<span>Найти связь</span></button></div>
     <div class="graph-stage"><div id="graph-canvas" aria-label="Интерактивный граф знаний. Те же сущности доступны через поиск и список." role="img"></div><div class="stage-top"><span class="scope-badge"><span class="live-dot"></span><span id="graph-scope">Модель ГОСТ</span></span><span class="displayed-count" id="displayed-count"></span></div><div class="graph-empty" id="graph-empty" hidden>Нет сущностей с выбранными фильтрами.<button class="button" data-action="all-categories">Показать все типы</button></div><div class="stage-bottom"><div class="stage-instructions" id="graph-instructions">Вращение — перетаскивание · Масштаб — колесо</div><div class="graph-controls"><button class="mode active" data-action="mode-3d" aria-label="Трёхмерный вид">3D</button><button class="mode" data-action="mode-2d" aria-label="Плоский вид">2D</button><span class="control-divider"></span><button class="icon-button active" data-action="labels" title="Подписи узлов" aria-label="Подписи узлов" aria-pressed="true">${icon('file-text')}</button><button class="icon-button" data-action="zoom-in" aria-label="Приблизить">${icon('plus')}</button><button class="icon-button" data-action="zoom-out" aria-label="Отдалить">${icon('minus')}</button><button class="icon-button" data-action="reset-camera" title="Весь граф" aria-label="Показать весь граф">${icon('maximize')}</button></div></div></div>
     <div class="graph-footer"><span>${icon('info')} Исследовательская модель, не полный текст стандарта</span><button data-action="catalog">Список сущностей ${icon('arrow-right')}</button></div>
    </section>
    <section class="view list-page" id="requirements-page" hidden><div class="list-toolbar"><label class="field-search">${icon('search')}<input id="requirement-search" placeholder="Поиск по требованиям…" aria-label="Поиск по требованиям"/></label><select id="requirement-force" aria-label="Нормативная сила"><option value="all">Все требования</option><option value="mandatory">Обязательные</option><option value="permitted">Допускается</option><option value="informative">Справочные</option></select><button class="icon-button" data-action="csv" title="Скачать CSV" aria-label="Скачать требования в CSV">${icon('download')}</button></div><div id="requirements-list"></div></section>
    <section class="view facts-page" id="facts-page" hidden><div class="fact-intro"><div class="fact-symbol">${icon('network')}</div><h2>От вопроса — к источнику</h2><p>Найдите требования и проследите их связи с объектами,<br class="desktop-only"/> условиями и фрагментами документа.</p><span class="pill">Поиск по структуре графа · без языковой модели</span></div><form id="fact-form" class="fact-form"><input id="fact-query" placeholder="Например, какая длина у блоков ФБС?" aria-label="Вопрос по данным" required/><button class="button primary" type="submit">Найти ${icon('arrow-right')}</button></form><div class="suggested-queries"><button data-query="Какая длина у блоков ФБС?">Длина ФБС ${icon('arrow-up-right')}</button><button data-query="Требования к прочности силикатного бетона">Прочность бетона ${icon('arrow-up-right')}</button><button data-query="Какая допустимая влажность легкого бетона?">Влажность ${icon('arrow-up-right')}</button><button data-query="Когда можно без монтажных петель?">Монтажные петли ${icon('arrow-up-right')}</button></div><div id="fact-results" aria-live="polite"></div></section>
    <section class="view sources-page" id="sources-page" hidden><div class="section-tabs"><button class="active" data-source-tab="files">Файлы <span id="files-total"></span></button><button data-source-tab="quality">Качество данных <span id="issues-total"></span></button></div><div id="sources-content"></div></section>
   </section>
   <aside class="inspector" id="inspector" aria-label="Карточка сущности"><div class="inspector-empty">Выберите сущность на графе</div></aside>
  </div>
  <footer class="app-footer"><span><span class="live-dot"></span> <span id="footer-status">Граф загружен</span></span><span>GraphRAG Workbench <span class="footer-separator">/</span> адаптация для JSON-LD <button data-action="about" aria-label="Сведения об адаптации">${icon('arrow-up-right')}</button></span></footer>
 </main>
 <dialog id="modal"><div id="modal-body"></div></dialog><div id="toast" role="status" aria-live="polite"></div><input type="file" id="import-input" accept=".json,.jsonld,.graphrag.json" multiple hidden/><input type="file" id="folder-input" webkitdirectory multiple hidden/>`;
 // Unknown icon placeholders are intentionally avoided in the final DOM.
 document.querySelector('[data-lucide="list-filter"]')?.remove();
 bind();drawIcons();
}
function renderSide() {
 $('#group-controls').innerHTML=[...Object.entries(GROUPS),['all','Все слои']].map(([g,label])=>`<button class="group-item ${group===g?'active':''}" data-group="${g}"><span>${g==='document'?icon('box'):g==='ontology'?icon('braces'):g==='archive'?icon('folder-open'):icon('layers')}${label}</span><small>${g==='all'?graph.nodes.length:graph.nodes.filter(n=>n.group===g).length}</small></button>`).join('');
 const nodes=baseNodes();
 $('#category-controls').innerHTML=Object.entries(CATEGORY).map(([c,info])=>{const count=nodes.filter(n=>n.category===c).length;if(!count)return '';return `<button class="category-item ${categories.has(c)?'checked':''}" data-category="${c}" aria-pressed="${categories.has(c)}"><span class="category-check" style="--category:${info.color}">${categories.has(c)?icon('check'):''}</span><span>${info.label}</span><small>${count}</small></button>`;}).join('');
 $('#nav-sources-count').textContent=String(graph.files.length);$('#nav-count').textContent=String(graph.nodes.filter(n=>n.group==='document').length);$('#req-count').textContent=String(graph.nodes.filter(n=>n.group==='document'&&n.category==='requirement').length);
 const activeIds=new Set(nodes.map(n=>n.id));$('#stat-nodes').textContent=fmt(nodes.length);$('#stat-edges').textContent=fmt(graph.edges.filter(e=>activeIds.has(e.source)&&activeIds.has(e.target)).length);$('#stat-files').textContent=String(graph.files.filter(f=>group==='all'||f.group===group).length);
 $('#graph-scope').textContent=(GROUPS as any)[group]??'Все слои';
 $('#commit-label').textContent=graph.meta.imported?'Локальный импорт':graph.meta.commit?.slice(0,8)??'Снимок данных';
 $('#footer-status').textContent=graph.meta.imported?'Импорт сохранён в этом браузере':`Снимок репозитория · ${graph.meta.commit?.slice(0,7)}`;
 $('#files-total').textContent=String(graph.files.length);$('#issues-total').textContent=String(graph.issues.length);
 drawIcons();
}
function filteredGraph():Graph {
 const nodes=baseNodes().filter(n=>categories.has(n.category)),ids=new Set(nodes.map(n=>n.id));
 return {...graph,nodes,edges:graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target))};
}
function renderGraph() {
 const filtered=filteredGraph();viewer.setData(filtered,upstream);viewer.setMode(mode2D);viewer.setLabels(labelMode);viewer.highlight(selected,pathNodes);
 $('#displayed-count').textContent=`${filtered.nodes.length} из ${baseNodes().length} узлов`;
 $('#graph-empty').hidden=filtered.nodes.length>0;
}
function selectNode(id:string,focus=false) {
 const node=nodeById(id);if(!node)return;
 if(group!=='all'&&node.group!==group){group=node.group;categories=new Set(Object.keys(CATEGORY).filter(x=>x!=='external'));renderSide();renderGraph();}
 if(!categories.has(node.category)){categories.add(node.category);renderSide();renderGraph();}
 selected=id;selectedTab='details';renderInspector();$('#inspector').classList.remove('collapsed');viewer.highlight(id,pathNodes);if(focus)viewer.focus(id);
 $('#search-results').hidden=true;$('#entity-search').setAttribute('aria-expanded','false');
 const url=new URL(location.href);url.hash=encodeURIComponent(id);history.replaceState(null,'',url);
}
function renderInspector() {
 const n=nodeById(selected);if(!n){$('#inspector').innerHTML='<div class="inspector-empty">Выберите сущность на графе или через поиск.</div>';return;}
 const info=(CATEGORY as any)[n.category]??CATEGORY.concept;
 const edges=graph.edges.filter(e=>e.source===n.id||e.target===n.id),outgoing=edges.filter(e=>e.source===n.id),incoming=edges.filter(e=>e.target===n.id);
 $('#inspector').innerHTML=`<div class="inspector-heading"><span class="eyebrow">ИНСПЕКТОР СУЩНОСТИ</span><button class="icon-button" data-action="close-inspector" aria-label="Закрыть карточку">${icon('x')}</button></div><div class="entity-title"><span class="type-badge" style="--type-color:${info.color}"><span class="dot"></span>${info.label}</span><h2>${esc(n.label)}</h2><div class="entity-id">${esc(n.sourceId)}<button class="plain icon-button" data-action="copy-id" title="Скопировать ID" aria-label="Скопировать идентификатор">${icon('clipboard')}</button></div><div class="entity-meta"><span>${icon('git-branch')} ${edges.length} связей</span><span>${icon('file-text')} ${n.sources.length} ${n.sources.length===1?'файл':'файла'}</span></div></div><div class="inspector-tabs"><button class="${selectedTab==='details'?'active':''}" data-inspector-tab="details">Описание</button><button class="${selectedTab==='connections'?'active':''}" data-inspector-tab="connections">Связи <small>${edges.length}</small></button><button class="${selectedTab==='json'?'active':''}" data-inspector-tab="json">JSON-LD</button></div><div class="inspector-content">${selectedTab==='json'?`<div class="json-tools"><span class="eyebrow">ИСХОДНЫЙ УЗЕЛ</span><button class="plain" data-action="download-node">${icon('download')} JSON</button></div><pre class="json-block">${esc(JSON.stringify(n.raw,null,2))}</pre>`:selectedTab==='connections'?`${connectionList(outgoing,n,'Исходящие связи')}${connectionList(incoming,n,'Входящие связи')}`:inspectorDetails(n,outgoing,incoming)}</div><div class="inspector-actions"><button class="button" data-action="isolate">${icon('crosshair')} Окружение</button><button class="button" data-action="focus">${icon('maximize')} На графе</button></div>`;
 drawIcons();
}
function inspectorDetails(n:Node,outgoing:Edge[],incoming:Edge[]) {
 let body='';const r=n.raw;
 const description=r.definition??r.comment??r['rdfs:comment']??r['skos:comment']??r.textQuote;
 if(description)body+=`<p class="entity-description">${esc(description)}</p>`;
 if(n.external)body+='<div class="notice warning">Определение отсутствует в данном слое. Ссылка сохранена как отдельный узел.</div>';
 if(n.category==='requirement') {
  body+=`<div class="requirement-formula"><span class="eyebrow">ОГРАНИЧЕНИЕ</span><strong>${esc(requirementValue(n))}</strong><span class="force force-${esc(r.hasNormativeForce)}">${esc(forces[r.hasNormativeForce]??r.hasNormativeForce??'Не задано')}</span></div>`;
  for(const [key,label]of[['appliesTo','Применяется к'],['aboutProperty','Свойство'],['hasCondition','Условие применимости'],['verifiedBy','Метод контроля']]){const nodes=related(n,key);if(nodes.length)body+=`<div class="detail-section"><h3>${label}</h3>${nodes.map(m=>nodeButton(m)).join('')}</div>`;}
  body+=evidence(n);
 } else {
  const interesting=outgoing.filter(e=>!['type','definedIn','statedIn'].includes(e.predicate));
  if(interesting.length)body+=`<div class="detail-section"><h3>Свойства и отношения</h3>${interesting.slice(0,8).map(e=>`<div class="relation-mini"><span>${esc(e.label)}</span>${nodeButton(nodeById(e.target)!)}</div>`).join('')}</div>`;
  const reqs=incoming.filter(e=>['appliesTo','aboutProperty','hasCondition','verifiedBy'].includes(e.predicate)).map(e=>nodeById(e.source)!).filter(n=>n.category==='requirement');
  if(reqs.length)body+=`<div class="detail-section"><h3>Связанные требования <span>${reqs.length}</span></h3>${reqs.slice(0,5).map(n=>`<button class="requirement-mini" data-node="${esc(n.id)}"><span>${esc(n.sourceId.split(':').pop())}</span><div>${esc(n.label)}<strong>${esc(requirementValue(n))}</strong></div>${icon('chevron-right')}</button>`).join('')}${reqs.length>5?`<button class="text-link" data-inspector-tab="connections">Все связи ${icon('arrow-right')}</button>`:''}</div>`;
  if(!interesting.length&&!reqs.length&&!description)body+='<p class="muted small">Сущность импортирована из исходного набора. Все поля доступны на вкладке JSON-LD.</p>';
 }
 const literalFields=Object.entries(r).filter(([k,v])=>!['id','@id','type','@type','label','prefLabel','comment','definition','textQuote','hasValue','hasOperator','hasNormativeForce','title'].includes(k)&&!outgoing.some(e=>e.predicate===k)&&typeof v!=='object');
 if(literalFields.length)body+=`<div class="detail-section"><h3>Поля источника</h3><dl class="literal-fields">${literalFields.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(scalar(v))}</dd>`).join('')}</dl></div>`;
 body+=`<div class="detail-section provenance"><h3>${icon('file-text')} Файлы источника</h3>${n.sources.map(f=>`<button data-file="${esc(f)}"><span>${esc(f.split('/').slice(-2).join('/'))}</span>${icon('arrow-up-right')}</button>`).join('')}<div class="muted tiny">Слой: ${(GROUPS as any)[n.group]??n.group}${n.anonymous?' · Вложенный узел':''}</div></div>`;
 return body;
}
function connectionList(edges:Edge[],node:Node,title:string) {
 if(!edges.length)return `<h3 class="connection-title">${title} · 0</h3><p class="muted small">Нет связей</p>`;
 return `<h3 class="connection-title">${title} · ${edges.length}</h3>${edges.map(e=>{const other=nodeById(e.source===node.id?e.target:e.source)!;return `<div class="connection-row"><div class="edge-label">${e.source===node.id?icon('arrow-right'):icon('arrow-right','reverse')} ${esc(e.label)} <code>${esc(e.predicate)}</code></div>${nodeButton(other)}</div>`;}).join('')}`;
}
const viewNames:Record<string,[string,string,string]>={graph:['Граф знаний','Нормативный граф','ГОСТ 13579-2018 · Блоки бетонные для стен подвалов'],requirements:['Требования','Нормативные требования','Ограничения, условия применимости и доказательная цепочка'],facts:['Поиск фактов','Исследование данных','Ответы из структуры графа со ссылками на исходные узлы'],sources:['Источники','Данные и происхождение','Исходные JSON-LD, версия репозитория и диагностика импорта']};
function changeView(next:string) {
 view=next;const v=viewNames[view];$('#breadcrumb-view').textContent=v[0];$('#view-title').innerHTML=`${v[1]}<span class="version-badge">v1.0</span>`;$('#view-subtitle').textContent=v[2];
 for(const el of document.querySelectorAll<HTMLElement>('.view'))el.hidden=el.id!==`${view}-page`;
 for(const el of document.querySelectorAll('[data-view]'))el.classList.toggle('active',el.getAttribute('data-view')===view);
 viewer.setPaused(view!=='graph');if(view==='requirements')renderRequirements();if(view==='sources')renderSources();
 $('#sidebar').classList.remove('mobile-open');drawIcons();
}
function visibleRequirements(){const q=reqSearch.toLocaleLowerCase('ru');return requirementNodes().filter(n=>(reqForce==='all'||n.raw.hasNormativeForce===reqForce)&&(!q||`${n.label} ${JSON.stringify(n.raw)} ${requirementValue(n)}`.toLocaleLowerCase('ru').includes(q)));}
function renderRequirements() {
 const rows=visibleRequirements();$('#requirements-list').innerHTML=`<div class="table-caption"><span>Требований в слое: ${rows.length}</span><span>Данные исследовательской модели</span></div>${rows.length?`<div class="table-scroll"><table><thead><tr><th>ID / Свойство</th><th>Ограничение</th><th>Условие</th><th>Источник</th></tr></thead><tbody>${rows.map(n=>{const cond=related(n,'hasCondition')[0],f=sourceFragment(n);return `<tr data-node="${esc(n.id)}" tabindex="0" class="${n.id===selected?'selected-row':''}"><td><span class="table-id">${esc(n.sourceId.split(':').pop())}</span><strong>${esc(related(n,'aboutProperty')[0]?.label??n.label)}</strong><span class="force force-${esc(n.raw.hasNormativeForce)}">${esc(forces[n.raw.hasNormativeForce]??'Не задано')}</span></td><td class="value-cell">${esc(requirementValue(n))}</td><td>${cond?esc(cond.label):'<span class="muted">Не задано</span>'}</td><td>${f?`<span class="source-chip">${esc(f.label)}</span>`:'—'}${icon('chevron-right')}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty-state">Требования не найдены.<p>Измените поиск или выберите слой «Модель ГОСТ».</p></div>'}`;drawIcons();
}
function renderSearch() {
 const results=searchNodes(graph,search,group==='all'?null:group).filter((n:Node)=>!n.external).slice(0,12) as Node[];
 const box=$('#search-results');searchIndex=Math.min(searchIndex,results.length-1);
 box.innerHTML=search.trim()?(results.length?`<div class="search-caption">СУЩНОСТИ · ${results.length}${results.length===12?'+':''}</div>${results.map((n,i)=>`<button class="search-result ${i===searchIndex?'keyboard-active':''}" data-node="${esc(n.id)}" role="option" aria-selected="${i===searchIndex}"><span class="dot" style="--dot:${(CATEGORY as any)[n.category]?.color}"></span><div><strong>${esc(n.label)}</strong><span>${esc(n.sourceId)}</span></div>${icon('arrow-up-right')}</button>`).join('')}`:'<div class="search-no-results">Ничего не найдено. Попробуйте «ФБС», «плотность» или ID узла.</div>'):'';
 box.hidden=!search.trim();$('#entity-search').setAttribute('aria-expanded',String(!box.hidden));drawIcons();
}
function renderSources() {
 for(const el of document.querySelectorAll('[data-source-tab]'))el.classList.toggle('active',el.getAttribute('data-source-tab')===sourceTab);
 $('#sources-content').innerHTML=sourceTab==='files'?`<div class="repository-note"><div class="repository-icon">${icon('git-branch')}</div><div><strong>${graph.meta.imported?'Импортированный проект':'f0k3s / dissertation'}</strong><p>${graph.meta.imported?'Файлы хранятся в этом браузере.':`Зафиксированная версия <code>${esc(graph.meta.commit?.slice(0,12))}</code>`}</p></div>${!graph.meta.imported?`<a class="button quiet" href="${esc(graph.meta.repository)}/tree/${esc(graph.meta.commit)}" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow-up-right')}</a>`:''}</div><div class="notice">${icon('info')} ${graph.meta.imported?"Импортированные данные сохранены локально. Исходные файлы и контексты доступны ниже.":"Загружены все 21 JSON-LD из репозитория. XML и изображение схемы не преобразуются в утверждения графа. Архив доступен отдельным слоем."}</div>${Object.entries(GROUPS).map(([g,title])=>`<div class="source-group"><div class="source-group-title">${icon(g==='ontology'?'braces':g==='archive'?'folder-open':'box')}<h3>${title}</h3><span>${graph.files.filter(f=>f.group===g).length} файлов</span></div>${graph.files.filter(f=>f.group===g).map(f=>`<button class="source-file" data-file="${esc(f.path)}">${icon('file-text')}<div><strong>${esc(f.path.split('/').pop())}</strong><span>${esc(f.path.split('/').slice(0,-1).join('/'))}</span></div><span class="file-nodes">${f.nodeCount} записей</span><code>${esc(f.sha256.slice(0,8))}</code>${icon('arrow-up-right')}</button>`).join('')}</div>`).join('')}`:`<div class="quality-summary"><div class="quality-icon">${icon('sliders-horizontal')}</div><div><h2>Прозрачный импорт</h2><p>Ни один исходный файл не исправляется автоматически. Неоднозначности видны здесь.</p></div></div>${graph.issues.map(i=>`<article class="issue ${i.level}"><span class="issue-symbol">${icon(i.level==='warning'?'alert-triangle':'info')}</span><div><span class="eyebrow">${esc(i.code)}</span><p>${esc(i.message)}</p>${i.file?`<button class="text-link" data-file="${esc(i.file)}">${esc(i.file.split('/').slice(-2).join('/'))}${icon('arrow-up-right')}</button>`:''}${i.nodeId?`<button class="text-link" data-node="${esc(i.nodeId)}">Открыть узел ${icon('arrow-right')}</button>`:''}</div></article>`).join('')}`;
 drawIcons();
}
function runFacts(q:string) {
 $<HTMLInputElement>('#fact-query').value=q;
 const normalized=q.toLowerCase().replaceAll('ё','е');
 const rules:[string[],string][]=[[['длин'],'length'],[['ширин'],'width'],[['высот'],'height'],[['прочн'],'compressive_strength'],[['плотн'],'average_density'],[['влажн'],'moisture_content'],[['петл'],'mounting_loop'],[['мороз'],'frost_resistance'],[['марк','обознач'],'markPattern']];
 const keys=rules.filter(([stems])=>stems.some(s=>normalized.includes(s))).map(([,key])=>key);
 let rows=graph.nodes.filter(n=>n.group==='document'&&n.category==='requirement');
 if(keys.length)rows=rows.filter(n=>keys.some(k=>`${n.raw.aboutProperty??''} ${n.raw.hasOperator??''}`.includes(k)));
 else {const matches=new Set(searchNodes(graph,q,'document').map((n:Node)=>n.id));rows=rows.filter(n=>matches.has(n.id)||graph.edges.some(e=>e.source===n.id&&matches.has(e.target)));}
 if(normalized.includes('силикат'))rows=rows.filter(n=>!n.raw.hasCondition||String(n.raw.hasCondition).includes('silicate'));
 else if(normalized.includes('легк'))rows=rows.filter(n=>!n.raw.hasCondition||String(n.raw.hasCondition).includes('lightweight'));
 else if(normalized.includes('тяжел'))rows=rows.filter(n=>!n.raw.hasCondition||String(n.raw.hasCondition).includes('heavy'));
 if(normalized.includes('без монтаж')||normalized.includes('без пет'))rows=rows.filter(n=>n.raw.hasOperator==='mayBeAbsent');
 if(normalized.includes('фбп')||normalized.includes('фбв'))rows=rows.filter(n=>n.raw.appliesTo!=='obj:fbs_block');
 $('#fact-results').innerHTML=rows.length?`<div class="fact-result-heading"><span class="eyebrow">НАЙДЕНО В ГРАФЕ</span><strong>Требований: ${rows.length}</strong></div>${rows.map(n=>`<article class="fact-card"><div class="fact-card-top"><span class="type-badge" style="--type-color:${CATEGORY.requirement.color}">Требование ${esc(n.sourceId.split(':').pop())}</span><button class="icon-button" data-node="${esc(n.id)}" aria-label="Открыть требование">${icon('arrow-up-right')}</button></div><h3>${esc(related(n,'aboutProperty')[0]?.label??n.label)}</h3><div class="fact-value">${esc(requirementValue(n))}</div><p class="fact-condition">Применяется к: ${esc(related(n,'appliesTo')[0]?.label??'не задано')}${related(n,'hasCondition').length?`<br/>Условие: ${esc(related(n,'hasCondition').map(m=>m.label).join('; '))}`:''}</p>${evidence(n)}<div class="fact-chain">${esc(related(n,'appliesTo')[0]?.label??'Объект')}${icon('chevron-right')}Требование ${esc(n.sourceId.split(':').pop())}${icon('chevron-right')}${esc(sourceFragment(n)?.label??'Источник не задан')}</div></article>`).join('')}<div class="fact-disclaimer">Поиск сопоставляет ключевые слова с узлами и связями набора. Отсутствие записи не означает отсутствие требования в стандарте.</div>`:'<div class="empty-state">Подходящих требований в наборе нет.<p>Попробуйте название свойства: длина, прочность, влажность, монтажные петли. Отсутствие записи не означает отсутствие требования в стандарте.</p></div>';
 drawIcons();
}
function modal(title:string,body:string,wide=false) {
 const d=$<HTMLDialogElement>('#modal');d.classList.toggle('wide',wide);
 $('#modal-body').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Закрыть окно">${icon('x')}</button></div>${body}`;
 if(!d.open)d.showModal();drawIcons();
}
function toast(text:string){$('#toast').textContent=text;$('#toast').classList.add('visible');window.setTimeout(()=>$('#toast').classList.remove('visible'),3600);}
function download(name:string,value:string,type='application/json'){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function openFile(path:string) {
 const f=graph.files.find(f=>f.path===path);
 modal(esc(path.split('/').pop()),'<div class="loading-line">Открываем исходный файл…</div>',true);
 try {
  let text=graph.meta.localSources?.[path];
  if(text===undefined){if(graph.meta.imported)text=JSON.stringify(graph.nodes.filter(n=>n.sources.includes(path)).map(n=>n.raw),null,2);else{const response=await fetch(`/data/raw/${path.split('/').map(encodeURIComponent).join('/')}`);if(!response.ok)throw new Error('Исходный файл недоступен.');text=await response.text();}}
  modal(esc(path.split('/').pop()),`<div class="source-path">${esc(path)}</div><div class="source-file-meta"><span>${esc((GROUPS as any)[f?.group??'document'])}</span>${f?.sha256?`<code title="SHA-256">SHA-256 ${esc(f.sha256)}</code>`:''}${linkFor(path)?`<a href="${esc(linkFor(path))}" target="_blank" rel="noopener noreferrer">На GitHub ${icon('arrow-up-right')}</a>`:''}</div><pre class="json-block source-code">${esc(text)}</pre>`,true);
 } catch(e){modal('Файл недоступен',`<div class="notice warning">${esc(e instanceof Error?e.message:e)}</div>`);}
}
function pathDialog() {
 const ns=baseNodes().filter(n=>!n.external&&!n.anonymous&&n.category!=='schema').sort((a,b)=>a.label.localeCompare(b.label,'ru'));
 const options=(id:string)=>ns.map(n=>`<option value="${esc(n.id)}" ${n.id===id?'selected':''}>${esc(n.label)} · ${esc(n.sourceId)}</option>`).join('');
 modal('Как связаны две сущности?',`<p class="modal-intro">Кратчайший путь по существующим связям. Направление каждого отношения сохраняется в подписи.</p><form id="path-form"><label class="form-label">Откуда<select name="from" aria-label="Откуда">${options(selected)}</select></label><label class="form-label">Куда<select name="to" aria-label="Куда">${options(ns.find(n=>n.sourceId==='prop:compressive_strength_class')?.id??ns[0]?.id??'')}</select></label><label class="checkbox-label"><input type="checkbox" name="meta"/> Учитывать общие источники и типы</label><button type="submit" class="button primary full-width">${icon('route')} Построить путь</button></form><div id="path-result" aria-live="polite"></div>`);
}
function renderPath(form:HTMLFormElement) {
 const data=new FormData(form),start=String(data.get('from')),end=String(data.get('to'));
 const scope=baseNodes(),ids=new Set(scope.map(n=>n.id)),excluded=data.get('meta')?[]:['type','definedIn','statedIn','domain','range'];
 const result=shortestPath({...graph,nodes:scope,edges:graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&!excluded.includes(e.predicate))},start,end);
 if(!result){$('#path-result').innerHTML='<div class="notice">Путь не найден в выбранном слое. Можно включить связи источников и типов.</div>';return;}
 pathNodes=new Set(result.nodes);for(const id of result.nodes){const n=nodeById(id);if(n)categories.add(n.category);}renderSide();renderGraph();viewer.highlight(selected,pathNodes);
 $('#path-result').innerHTML=`<div class="path-result"><div class="eyebrow">${result.edges.length} ПЕРЕХОДОВ · ПО СМЕЖНОСТИ</div>${result.nodes.map((id:string,i:number)=>`${nodeButton(nodeById(id)!)}${i<result.edges.length?`<div class="path-edge">${icon('git-branch')} ${esc(graph.edges.find(e=>e.id===result.edges[i])?.label)}<small>${graph.edges.find(e=>e.id===result.edges[i])?.source===id?'→ по направлению':'← против направления'}</small></div>`:''}`).join('')}</div>`;drawIcons();
}
function catalog(){modal('Сущности выбранного слоя',`<div class="catalog-list">${baseNodes().filter(n=>categories.has(n.category)).sort((a,b)=>a.label.localeCompare(b.label,'ru')).map(n=>nodeButton(n)).join('')}</div>`,true);}
async function persistImported(value:Graph|null) {
 return new Promise<void>((resolve,reject)=>{const request=indexedDB.open('norma-workbench',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite'),store=tx.objectStore('state');if(value)store.put(value,'project');else store.delete('project');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});
}
async function restoreImported():Promise<Graph|null> {
 return new Promise(resolve=>{const r=indexedDB.open('norma-workbench',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>resolve(null);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readonly'),q=tx.objectStore('state').get('project');q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();};});
}
async function handleImport(files:FileList|null) {
 if(!files?.length)return;
 try {
  const list=[...files].filter(f=>/\.(jsonld|json)$/i.test(f.name));
  if(!list.length)throw new Error('Выберите JSON-LD или файл .graphrag.json.');
  if(list.reduce((s,f)=>s+f.size,0)>20*1024*1024)throw new Error('Для браузерного импорта выберите не более 20 МБ.');
  if(list.length>300)throw new Error('Можно импортировать до 300 файлов за один раз.');
  const parsed=await Promise.all(list.map(async f=>{const text=await f.text();return {file:f,text,data:JSON.parse(text)};}));
  let next:Graph;
  if(parsed.length===1&&parsed[0].data.format==='graphrag-workbench-output')next=fromWorkbench(parsed[0].data) as Graph;
  else {
   const data=parsed.map(p=>{const rawPath=p.file.webkitRelativePath||p.file.name;const modelIndex=rawPath.indexOf('model/'),archiveIndex=rawPath.indexOf('data/archive/');const path=modelIndex>=0?rawPath.slice(modelIndex):archiveIndex>=0?rawPath.slice(archiveIndex):`model/documents/imported/${rawPath.replace(/^[^/]+\//,'')}`;return {path,text:p.text,data:p.data};});
   next=ingest(data,{imported:true,projectName:list[0].name,localSources:Object.fromEntries(data.map(f=>[f.path,f.text]))}) as Graph;
  }
  if(!next.nodes.length)throw new Error('В файлах не найдены узлы с @id или id. Текущий проект сохранён.');
  if(next.nodes.length>4000)throw new Error('Веб-версия рассчитана на графы до 4 000 узлов. Большой пакет откройте в оригинальном Workbench.');
  next.meta.imported=true;await persistImported(next);graph=next;upstream=undefined;selected='';group='document';if(!graph.nodes.some(n=>n.group===group))group=graph.nodes[0].group;
  categories=new Set(Object.keys(CATEGORY));pathNodes.clear();$<HTMLDialogElement>('#modal').close();renderSide();renderGraph();selectNode(baseNodes().find(n=>!n.external)?.id??'');changeView('graph');toast(`Импортировано ${graph.nodes.length} узлов и ${graph.edges.length} связей`);
 } catch(e){const message=e instanceof Error?e.message:'Импорт не выполнен.';if($<HTMLDialogElement>('#modal').open){$('#import-error')?.remove();$('#modal-body').insertAdjacentHTML('beforeend',`<div class="notice warning" id="import-error" role="alert">${esc(message)}</div>`);}else toast(message);}
 $<HTMLInputElement>('#import-input').value='';$<HTMLInputElement>('#folder-input').value='';
}
function bind() {
 document.addEventListener('click',async event=>{
  const target=(event.target as Element).closest<HTMLElement>('button,a[data-action],tr[data-node]');if(!target)return;
  if(target.dataset.view){changeView(target.dataset.view);return;}
  if(target.dataset.group){$('#sidebar').classList.remove('mobile-open');group=target.dataset.group;categories=new Set(Object.keys(CATEGORY).filter(c=>group==='ontology'?c!=='external':!['schema','external'].includes(c)));pathNodes.clear();renderSide();renderGraph();if(!baseNodes().some(n=>n.id===selected))selectNode(baseNodes().find(n=>!n.external)?.id??'');renderRequirements();return;}
  if(target.dataset.category){const c=target.dataset.category;categories.has(c)?categories.delete(c):categories.add(c);renderSide();renderGraph();return;}
  if(target.dataset.node){selectNode(target.dataset.node);if(target.closest('#modal'))$<HTMLDialogElement>('#modal').close();if(view==='requirements')renderRequirements();$('#inspector').classList.remove('collapsed');return;}
  if(target.dataset.file){await openFile(target.dataset.file);return;}
  if(target.dataset.inspectorTab){selectedTab=target.dataset.inspectorTab;renderInspector();return;}
  if(target.dataset.sourceTab){sourceTab=target.dataset.sourceTab;renderSources();return;}
  if(target.dataset.query){runFacts(target.dataset.query);return;}
  const action=target.dataset.action;if(!action)return;
  if(target.tagName==='A')event.preventDefault();
  switch(action) {
   case 'home':changeView('graph');break;
   case 'menu':$('#sidebar').classList.toggle('mobile-open');break;
   case 'export':download('dissertation.graphrag.json',JSON.stringify(toWorkbench(graph)));toast('Граф экспортирован в формат GraphRAG Workbench');break;
   case 'import':modal('Импорт графа',`<p class="modal-intro">Готовый пакет GraphRAG Workbench или исходные JSON-LD. Импорт проверяется до замены проекта и сохраняется в этом браузере.</p><div class="import-options"><button class="import-option" data-action="choose-files">${icon('upload')}<strong>Выбрать файлы</strong><span>.graphrag.json или несколько .jsonld</span></button><button class="import-option" data-action="choose-folder">${icon('folder-open')}<strong>Выбрать папку</strong><span>С сохранением путей и локальных контекстов</span></button></div><div class="notice">Внешние контексты по сети не загружаются. Поддерживается структурный диалект данного репозитория; для RDF/OWL вывода нужен отдельный движок.</div><button class="button full-width" data-action="restore-original">${icon('rotate-ccw')} Вернуть снимок диссертации</button>`);break;
   case 'choose-files':$<HTMLInputElement>('#import-input').click();break;
   case 'choose-folder':$<HTMLInputElement>('#folder-input').click();break;
   case 'restore-original':await persistImported(null);graph=original;group='document';categories=new Set(Object.keys(CATEGORY).filter(c=>!['schema','external'].includes(c)));pathNodes.clear();renderSide();renderGraph();selectNode(graph.nodes.find(n=>n.sourceId==='obj:basement_wall_block')!.id);changeView('graph');$<HTMLDialogElement>('#modal').close();toast('Восстановлен исходный снимок репозитория');break;
   case 'all-categories':categories=new Set(Object.keys(CATEGORY));renderSide();renderGraph();break;
   case 'zoom-in':viewer.zoom(1.25);break;
   case 'zoom-out':viewer.zoom(.8);break;
   case 'reset-camera':pathNodes.clear();viewer.highlight(selected,pathNodes);viewer.reset();break;
   case 'labels':labelMode=!labelMode;viewer.setLabels(labelMode);target.classList.toggle('active',labelMode);target.setAttribute('aria-pressed',String(labelMode));break;
   case 'mode-2d':case 'mode-3d':mode2D=action==='mode-2d';viewer.setMode(mode2D);document.querySelectorAll('.mode').forEach(e=>e.classList.toggle('active',e.getAttribute('data-action')===(mode2D?'mode-2d':'mode-3d')));break;
   case 'path':pathDialog();break;
   case 'catalog':catalog();break;
   case 'close-modal':$<HTMLDialogElement>('#modal').close();break;
   case 'close-inspector':$('#inspector').classList.add('collapsed');break;
   case 'focus':changeView('graph');$('#inspector').classList.remove('collapsed');viewer.focus(selected);break;
   case 'isolate':{const n=nodeById(selected);if(!n)break;const ids=new Set([selected]);for(const e of graph.edges)if(e.source===selected||e.target===selected){ids.add(e.source);ids.add(e.target);}viewer.setData({...graph,nodes:graph.nodes.filter(n=>ids.has(n.id)),edges:graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target))});viewer.highlight(selected);changeView('graph');$('#displayed-count').textContent=`Окружение: ${ids.size} узлов`;toast('Показано окружение. «Весь граф» восстановит выбранный слой.');break;}
   case 'copy-id':try{await navigator.clipboard.writeText(nodeById(selected)?.iri??selected);toast('Идентификатор скопирован');}catch{toast('Копирование недоступно в этом браузере. ID есть на вкладке JSON-LD.');}break;
   case 'download-node':download('entity.jsonld',JSON.stringify(nodeById(selected)?.raw,null,2));break;
   case 'csv':{const cells=[['ID','Свойство','Ограничение','Условие','Источник'],...visibleRequirements().map(n=>[n.sourceId,related(n,'aboutProperty')[0]?.label??n.label,requirementValue(n),related(n,'hasCondition').map(n=>n.label).join('; '),sourceFragment(n)?.label??''])];download('requirements.csv','\uFEFF'+cells.map(row=>row.map(cell=>'"'+String(cell).replaceAll('"','""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8');break;}
   case 'about':modal('Норма · исследовательский Workbench',`<div class="about-brand">${icon('network')}<h3>Граф, который можно проверить</h3></div><p>Приложение исследует JSON-LD из <a href="https://github.com/f0k3s/dissertation" target="_blank" rel="noopener noreferrer">f0k3s/dissertation</a>: показывает реальные ссылки между сущностями, условиями и фрагментами документа.</p><p>Использованы загрузчик данных и подход к 3D-компоновке <a href="https://github.com/lyon-industries/graphrag-workbench" target="_blank" rel="noopener noreferrer">Lyon Industries GraphRAG Workbench</a> (MIT), Three.js и d3-force-3d. <a href="/licenses/GraphRAG-Workbench-MIT.txt" target="_blank">Лицензия</a>.</p><div class="notice">Это адаптация для уже структурированных данных. Python-индексация Microsoft GraphRAG и генерация ответов языковой моделью в этой веб-версии не запускаются. Поиск фактов работает по связям и ключевым словам.</div><p>Экспорт <code>.graphrag.json</code> открывается в оригинальном Workbench через Projects → Import bundle. Группы в приложении заданы типами сущностей; они не выдаются за автоматически найденные сообщества.</p><p class="muted small">Модель по мотивам анализа ГОСТ не является полной цифровой копией стандарта. Все числовые значения и подписи показаны из репозитория. Импортированные данные остаются в этом браузере.</p>`);break;
  }
  if(action==='reset-camera')renderGraph();
 });
 $('#entity-search').addEventListener('input',e=>{search=(e.target as HTMLInputElement).value;searchIndex=0;renderSearch();});
 $('#entity-search').addEventListener('keydown',e=>{const key=(e as KeyboardEvent).key;if(key==='ArrowDown'||key==='ArrowUp'){e.preventDefault();searchIndex=Math.max(0,searchIndex+(key==='ArrowDown'?1:-1));renderSearch();}if(key==='Enter'){e.preventDefault();const n=searchNodes(graph,search,group==='all'?null:group).filter((n:Node)=>!n.external)[searchIndex];if(n)selectNode(n.id,true);}if(key==='Escape'){$('#search-results').hidden=true;$('#entity-search').setAttribute('aria-expanded','false');}});
 $('#requirement-search').addEventListener('input',e=>{reqSearch=(e.target as HTMLInputElement).value;renderRequirements();});
 $('#requirement-force').addEventListener('change',e=>{reqForce=(e.target as HTMLSelectElement).value;renderRequirements();});
 document.addEventListener('submit',e=>{const form=e.target as HTMLFormElement;if(form.id==='fact-form'){e.preventDefault();runFacts($<HTMLInputElement>('#fact-query').value);}if(form.id==='path-form'){e.preventDefault();renderPath(form);}});
 $('#import-input').addEventListener('change',e=>handleImport((e.target as HTMLInputElement).files));$('#folder-input').addEventListener('change',e=>handleImport((e.target as HTMLInputElement).files));
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();changeView('graph');$('#entity-search').focus();}if(e.key==='Enter'&&(e.target as HTMLElement).matches('tr[data-node]'))selectNode((e.target as HTMLElement).dataset.node!);});
 document.addEventListener('click',e=>{if(!(e.target as Element).closest('.search-wrapper')){$('#search-results').hidden=true;$('#entity-search').setAttribute('aria-expanded','false');}});
 $<HTMLDialogElement>('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$<HTMLDialogElement>('#modal').close();});
}
async function boot() {
 try {
  const response=await fetch('/data/graph.json');if(!response.ok)throw new Error('Не удалось загрузить снимок графа.');original=await response.json();graph=await restoreImported()??original;
  if(!graph.meta.imported)upstream=await new GraphDataLoader('/data/workbench').loadGraphData();
  shell();viewer=new GraphView($('#graph-canvas'),id=>selectNode(id),value=>{webgl=value;});
  renderSide();renderGraph();
  const hash=decodeURIComponent(location.hash.slice(1));const start=graph.nodes.find(n=>n.id===hash)??graph.nodes.find(n=>n.sourceId==='obj:basement_wall_block')??graph.nodes.find(n=>!n.external);
  if(start)selectNode(start.id);if(window.matchMedia('(max-width:760px)').matches)$('#inspector').classList.add('collapsed');
  document.addEventListener('visibilitychange',()=>viewer.setPaused(document.hidden||view!=='graph'));
 } catch(e){app.innerHTML=`<div class="boot error-state"><h1>Граф не загрузился</h1><p>${esc(e instanceof Error?e.message:e)}</p><button onclick="location.reload()">Попробовать снова</button></div>`;}
}
boot();
