// Structural adapter for the repository's application JSON-LD dialect.
// It deliberately does not claim full RDF/OWL reasoning or silently equate labels.
export const GROUPS = { document: 'Модель ГОСТ', ontology: 'Онтология', archive: 'Архив' };
export const CATEGORY = {
  object: {label:'Объекты',color:'#75b7ff'}, material:{label:'Материалы',color:'#dcab75'},
  property:{label:'Свойства',color:'#b6a0fa'}, requirement:{label:'Требования',color:'#62d9ba'},
  document:{label:'Документы',color:'#edce7f'}, fragment:{label:'Фрагменты',color:'#ec99bc'},
  concept:{label:'Концепты',color:'#80ced5'}, value:{label:'Значения и единицы',color:'#a4ba86'},
  condition:{label:'Условия и методы',color:'#efa184'}, schema:{label:'Схема',color:'#8a9bab'},
  external:{label:'Внешние ссылки',color:'#657589'}
};
export const PREDICATES = {
  type:'имеет тип', subClassOf:'подкласс', domain:'область определения', range:'диапазон',
  definedIn:'определено в', statedIn:'содержится в', denotes:'обозначает', refersTo:'ссылается на',
  appliesTo:'применяется к', aboutProperty:'регулирует свойство', hasValue:'значение', hasUnit:'единица',
  unit:'единица', hasOperator:'оператор', hasCondition:'при условии', verifiedBy:'проверяется по',
  hasMaterial:'материал', hasPropertyType:'имеет свойство', hasEnumeration:'перечисление',
  hasAllowedValue:'допустимое значение', hasNormativeForce:'нормативная сила',
  broader:'более общее понятие', relatedMatch:'сопоставлено с', isPartOf:'часть',
  hasFragment:'содержит фрагмент', hasRequirement:'содержит требование', hasConcept:'содержит концепт',
  specializes:'уточняет',exceptionTo:'исключение для',conflictsWith:'конфликтует с',supersededBy:'заменено'
};
const REF_KEYS = new Set(Object.keys(PREDICATES).filter(x=>!['hasValue','hasOperator','hasNormativeForce'].includes(x)));
export const localName = value => (String(value??'').split(/[\/#:]/).filter(Boolean).pop() || '').replace(/^@/,'');
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const getId = raw => raw?.['@id'] ?? raw?.id;
const getType = raw => array(raw?.['@type']??raw?.type).map(String);
const literal = value => typeof value==='string' ? value : value?.['@value'] ?? value?.value ?? '';
function labelOf(raw,id) {
  for(const key of ['label','prefLabel','rdfs:label','skos:prefLabel','title','ex:title']) {
    const v=array(raw[key]).map(literal).find(Boolean); if(v) return String(v);
  }
  if(raw.clauseNumber) return `Пункт ${raw.clauseNumber}`;
  if(raw.tableNumber) return `Таблица ${raw.tableNumber}`;
  if(raw.numericValue!=null) return `${raw.numericValue} ${raw.unit??''}`.trim();
  if(getType(raw).some(x=>localName(x)==='Requirement')) return `Требование ${String(id).split(':').pop()}`;
  return localName(id) || 'Вложенное значение';
}
function categoryOf(raw) {
  const types=getType(raw).map(localName);
  if(types.some(t=>['Class','Property','ObjectProperty','DatatypeProperty'].includes(t))) return 'schema';
  if(types.includes('Requirement')) return 'requirement';
  if(types.some(t=>['ObjectClass','DomainEntity','ProcessClass'].includes(t)))return 'object';
  if(types.includes('MaterialClass'))return 'material';
  if(types.includes('PropertyType'))return 'property';
  if(types.includes('NormativeDocument'))return 'document';
  if(types.includes('DocumentFragment'))return 'fragment';
  if(types.some(t=>['DocumentConcept','Concept','ConstructionConcept'].includes(t)))return 'concept';
  if(types.some(t=>['Condition','TestMethod','Exception'].includes(t)))return 'condition';
  return 'value';
}
function normalizePath(path){const out=[]; for(const p of path.split('/')){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}return out.join('/');}
export function ingest(files,meta={}) {
  const byPath=new Map(files.map(f=>[f.path,f]));
  const contexts=new Map();
  function contextFor(file,seen=new Set()) {
    if(contexts.has(file.path))return contexts.get(file.path);
    if(seen.has(file.path))return {}; seen.add(file.path);
    let c={};
    for(const part of array(file.data?.['@context'])) {
      if(typeof part==='object'&&part)c={...c,...part};
      else if(typeof part==='string') {
        const ref=byPath.get(normalizePath(`${file.path.split('/').slice(0,-1).join('/')}/${part}`));
        if(ref)c={...c,...contextFor(ref,seen)};
      }
    }
    contexts.set(file.path,c); return c;
  }
  function expand(id,context) {
    if(!id)return ''; if(/^https?:|^urn:|^_:/.test(id))return id;
    const at=id.indexOf(':'); if(at<0)return id;
    const prefix=context[id.slice(0,at)];
    // A term such as `unit: { @id: ns:unit }` is not a prefix declaration.
    const base=typeof prefix==='string'?prefix:prefix?.['@prefix']?prefix['@id']:null;
    if(base && /[/#:]$/.test(base))return base+id.slice(at+1);
    return id;
  }
  const nodes=new Map(), edges=new Map(), issues=[], entries=[];
  const groupOf=path=>path.startsWith('model/ontology/')?'ontology':path.startsWith('data/archive/')?'archive':'document';
  function register(raw,file,pointer,explicit=true) {
    const group=groupOf(file.path), context=contextFor(file), sourceId=String(getId(raw)??`_:${file.path}#${pointer}`);
    const iri=expand(sourceId,context), id=`${group}|${iri}`;
    const existing=nodes.get(id);
    if(existing) {
      if(!existing.sources.includes(file.path))existing.sources.push(file.path);
      if(existing.external){existing.label=labelOf(raw,sourceId);existing.type=getType(raw).map(localName).join(', ');existing.category=categoryOf(raw);existing.raw=raw;existing.pointer=pointer;existing.anonymous=!getId(raw);}
      else {
        if(JSON.stringify(existing.raw)!==JSON.stringify(raw) && explicit && !issues.some(i=>i.code==='multiple-definitions'&&i.nodeId===id))
          issues.push({level:'info',code:'multiple-definitions',message:`Несколько описаний ${sourceId}; отношения объединены по идентификатору, исходные записи сохранены в файлах.`,nodeId:id,file:file.path});
        const merged={...existing.raw};
        for(const [key,value]of Object.entries(raw)) {
          if(!(key in merged)||JSON.stringify(merged[key])===JSON.stringify(value)){merged[key]=value;continue;}
          const values=[...array(merged[key]),...array(value)],unique=[...new Map(values.map(v=>[JSON.stringify(v),v])).values()];
          merged[key]=unique.length===1?unique[0]:unique;
        }
        existing.raw=merged;
      }
      existing.external=false;
      return id;
    }
    const node={id,iri,sourceId,label:labelOf(raw,sourceId),type:getType(raw).map(localName).join(', '),category:categoryOf(raw),group,
      sources:[file.path],raw,anonymous:!getId(raw),external:false,degree:0,pointer};
    nodes.set(id,node); return id;
  }
  for(const file of files) {
    if(!file.data)continue;
    const top=Array.isArray(file.data)?file.data:file.data['@graph']??(getId(file.data)?[file.data]:[]);
    for(let i=0;i<top.length;i++)if(top[i]&&typeof top[i]==='object')entries.push({id:register(top[i],file,String(i)),raw:top[i],file,pointer:String(i)});
  }
  function resolve(value,file) {return `${groupOf(file.path)}|${expand(value,contextFor(file))}`;}
  function edge(source,target,predicate,file,pointer) {
    const id=`${source}→${predicate}→${target}`;
    if(edges.has(id)){const e=edges.get(id);if(!e.sources.includes(file.path))e.sources.push(file.path);return;}
    edges.set(id,{id,source,target,predicate,label:PREDICATES[predicate]??predicate,sources:[file.path],pointer});
  }
  function referenced(value,file) {
    const id=resolve(value,file);
    if(!nodes.has(id)) {
      const group=groupOf(file.path), iri=expand(value,contextFor(file));
      nodes.set(id,{id,iri,sourceId:value,label:localName(value),type:'Reference',category:'external',group,sources:[file.path],raw:{'@id':value},anonymous:false,external:true,degree:0,pointer:''});
      if(!/^https?:\/\/(www\.w3\.org|purl\.org)\//.test(iri))issues.push({level:'warning',code:'unresolved-reference',message:`Ссылка ${value} не имеет собственного определения в этом слое.`,nodeId:id,file:file.path});
    }
    return id;
  }
  function walk(source,raw,file,pointer) {
    for(const [key,input] of Object.entries(raw)) {
      if(['@context','@id','id'].includes(key))continue;
      const predicate=localName(key);
      for(const [index,v] of array(input).entries()) {
        const p=`${pointer}/${key}/${index}`;
        if(v&&typeof v==='object') {
          if('@value'in v)continue;
          const rid=getId(v);
          if(rid) {
            const target=Object.keys(v).length>1?register(v,file,p,false):referenced(String(rid),file);
            edge(source,target,predicate,file,p); if(Object.keys(v).length>1)walk(target,v,file,p);
          } else {
            const target=register(v,file,p,false);edge(source,target,predicate,file,p);walk(target,v,file,p);
          }
        } else if(typeof v==='string') {
          const known=nodes.has(resolve(v,file));
          const typed=contextFor(file)[key]?.['@type']==='@id';
          if(known||typed||REF_KEYS.has(predicate))edge(source,referenced(v,file),predicate,file,p);
        }
      }
    }
  }
  for(const e of entries)walk(e.id,e.raw,e.file,e.pointer);
  for(const e of edges.values()){nodes.get(e.source).degree++;nodes.get(e.target).degree++;}
  for(const n of nodes.values())if(n.category==='requirement') {
    const r=n.raw, values=edges.values();
    const prop=[...values].find(e=>e.source===n.id&&e.predicate==='aboutProperty');
    if(!r.label&&!r['rdfs:label'] && prop)n.label=`${nodes.get(prop.target).label} · ${n.sourceId.split(':').pop()}`;
  }
  const activeReq=[...nodes.values()].filter(n=>n.group==='document'&&n.category==='requirement'&&!n.external);
  if(activeReq.length)issues.unshift({level:'info',code:'research-model',message:'Набор — исследовательская семантическая модель по мотивам ГОСТ, а не полная цифровая копия стандарта. Значения показаны как записано в репозитории.'});
  if(files.some(f=>f.path.includes('gost_13579-2018/core.jsonld'))) {
    issues.push({level:'warning',code:'unit-prefix',message:'В контексте модели `unit` объявлен свойством, а в идентификаторах используется как префикс. Адаптер сохраняет unit:mm без подмены; для строгого RDF нужен отдельный префикс.',file:'model/documents/gost_13579-2018/core.jsonld'});
    issues.push({level:'info',code:'separate-namespaces',message:'Онтология и документная модель используют разные пространства имён. Узлы с одинаковыми названиями не объединяются автоматически.'});
    issues.push({level:'info',code:'application-jsonld',message:'В hasValue именованные значения enum:* интерпретируются адаптером как ссылки, если узел существует. Исходные литералы и контексты сохранены; это не OWL-вывод.'});
  }
  return {nodes:[...nodes.values()],edges:[...edges.values()],files:files.map(f=>({path:f.path,sha256:f.sha256??'',bytes:new TextEncoder().encode(f.text??'').length,group:groupOf(f.path),nodeCount:entries.filter(e=>e.file.path===f.path).length})),issues:issues.filter(i=>i.code!=='unresolved-reference'||nodes.get(i.nodeId)?.external),meta};
}
export function neighbors(graph,id) {
  return graph.edges.filter(e=>e.source===id||e.target===id).map(e=>({edge:e,node:graph.nodes.find(n=>n.id===(e.source===id?e.target:e.source))}));
}
export function shortestPath(graph,start,end) {
  if(start===end)return {nodes:[start],edges:[]};
  const adjacency=new Map();
  for(const e of graph.edges){for(const [a,b]of[[e.source,e.target],[e.target,e.source]]){if(!adjacency.has(a))adjacency.set(a,[]);adjacency.get(a).push([b,e.id]);}}
  const queue=[start],prev=new Map([[start,null]]);
  for(let i=0;i<queue.length;i++)for(const [next,eid]of adjacency.get(queue[i])??[])if(!prev.has(next)) {
    prev.set(next,[queue[i],eid]);queue.push(next);
    if(next===end){const ns=[end],es=[];let p=end;while(p!==start){const [before,edge]=prev.get(p);ns.unshift(before);es.unshift(edge);p=before;}return {nodes:ns,edges:es};}
  }
  return null;
}
/** @param {any} graph @param {string} query @param {string|null} [group] */
export function searchNodes(graph,query,group=null) {
  const q=query.toLocaleLowerCase('ru').replaceAll('ё','е').trim(),tokens=q.split(/\s+/).filter(Boolean);
  return graph.nodes.filter(n=>!group||n.group===group).map(n=>{
    const label=n.label.toLocaleLowerCase('ru').replaceAll('ё','е'),body=`${n.sourceId} ${n.type} ${JSON.stringify(n.raw)}`.toLocaleLowerCase('ru').replaceAll('ё','е');
    return {node:n,score:!q?n.degree:tokens.reduce((s,t)=>s+(label===t?20:label.includes(t)?8:body.includes(t)?2:0),0)};
  }).filter(x=>!q||x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.node);
}
export function toWorkbench(graph,group=null) {
  const nodes=graph.nodes.filter(n=>!group||n.group===group),ids=new Set(nodes.map(n=>n.id));
  const edges=graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
  const categories=[...new Set(nodes.map(n=>n.category))];
  const entities=nodes.map((n,i)=>({id:n.id,human_readable_id:i,title:n.label,type:n.category,description:`${n.label}\n${n.sourceId}\n${JSON.stringify(n.raw,null,2)}`,text_unit_ids:n.sources,frequency:n.sources.length,degree:n.degree,label:n.label,source_id:n.sourceId,source_iri:n.iri,raw:n.raw}));
  return {format:'graphrag-workbench-output',version:1,exportedAt:new Date().toISOString(),projectName:'Норма · диссертация',
    artifacts:{entities,relationships:edges.map((e,i)=>({id:e.id,human_readable_id:i,source:e.source,target:e.target,description:e.label,weight:1,combined_degree:0,text_unit_ids:e.sources,predicate:e.predicate})),
      communities:categories.map((c,i)=>({id:`category-${i}`,community:i,human_readable_id:i,level:0,parent:-1,children:[],title:CATEGORY[c]?.label??c,entity_ids:nodes.filter(n=>n.category===c).map(n=>n.id),relationship_ids:[],text_unit_ids:[],period:'',size:nodes.filter(n=>n.category===c).length})),community_reports:[],
      text_units:graph.files.map(f=>({id:f.path,text:graph.meta.localSources?.[f.path]??JSON.stringify(nodes.filter(n=>n.sources.includes(f.path)).map(n=>n.raw),null,2),n_tokens:0,document_ids:[f.path]}))},
    norma:{graph,communitiesMethod:'Группировка по типу сущности; не сообщества Microsoft GraphRAG.'}};
}
export function fromWorkbench(bundle) {
  if(bundle.format!=='graphrag-workbench-output'||bundle.version!==1)throw new Error('Неподдерживаемый формат Workbench.');
  const a=bundle.artifacts;if(!Array.isArray(a?.entities)||!a.entities.length||!Array.isArray(a?.relationships))throw new Error('Нужны непустые entities и массив relationships.');
  const ids=new Set();for(const n of a.entities){if(!n.id||ids.has(String(n.id)))throw new Error('Идентификаторы сущностей должны быть уникальными.');ids.add(String(n.id));}
  const titleIds=new Map(a.entities.map(n=>[n.title,String(n.id)]));
  for(const e of a.relationships)if(!ids.has(String(e.source))&&!titleIds.has(e.source)||!ids.has(String(e.target))&&!titleIds.has(e.target))throw new Error('В связях есть отсутствующая сущность.');
  // Reconstruct from the validated portable tables, never trust an embedded graph.
  const rawGraph=bundle.norma?.graph;
  const nodeMeta=new Map((rawGraph?.nodes??[]).map(n=>[n.id,n]));
  return {nodes:a.entities.map((n,i)=>{const extra=nodeMeta.get(String(n.id));return {id:String(n.id),iri:extra?.iri??String(n.id),sourceId:extra?.sourceId??String(n.source_id??n.id),label:extra?.label??String(n.label??n.title??n.id),type:String(n.type??'Entity'),category:CATEGORY[n.type]?n.type:'concept',group:extra?.group??'document',sources:Array.isArray(n.text_unit_ids)?n.text_unit_ids.map(String):[],raw:n.raw??{description:n.description??''},anonymous:extra?.anonymous??false,external:extra?.external??false,degree:Number(n.degree??0),pointer:String(i)};}),
    edges:a.relationships.map((e,i)=>({id:String(e.id??`edge-${i}`),source:ids.has(String(e.source))?String(e.source):titleIds.get(e.source),target:ids.has(String(e.target))?String(e.target):titleIds.get(e.target),predicate:String(e.predicate??'related'),label:String(e.description??'связано'),sources:Array.isArray(e.text_unit_ids)?e.text_unit_ids.map(String):[]})),
    files:rawGraph?.files??(a.text_units??[]).map(t=>({path:String(t.id),sha256:'',bytes:new TextEncoder().encode(String(t.text??'')).length,group:'document',nodeCount:0})),issues:rawGraph?.issues??[],meta:{...(rawGraph?.meta??{}),localSources:{...Object.fromEntries((a.text_units??[]).map(t=>[String(t.id),String(t.text??'')])),...(rawGraph?.meta?.localSources??{})},imported:true,projectName:bundle.projectName}};
}
