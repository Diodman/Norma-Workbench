import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ingest,toWorkbench,fromWorkbench,shortestPath,searchNodes} from '../src/core/ingest.mjs';
const graph=JSON.parse(await fs.readFile(new URL('../public/data/graph.json',import.meta.url)));
const find=id=>graph.nodes.find(n=>n.sourceId===id&&n.group==='document');

test('every edge has both endpoints and original source provenance',()=>{
 const ids=new Set(graph.nodes.map(n=>n.id));assert.equal(ids.size,graph.nodes.length);
 for(const e of graph.edges){assert(ids.has(e.source),e.source);assert(ids.has(e.target),e.target);assert(e.sources.length>0);}
 for(const n of graph.nodes)assert(n.sources.length>0);
});
test('all 15 document requirements retain fragment, object, force and raw values',()=>{
 const reqs=graph.nodes.filter(n=>n.group==='document'&&n.category==='requirement');assert.equal(reqs.length,15);
 for(const n of reqs){for(const p of ['statedIn','definedIn','appliesTo'])assert(graph.edges.some(e=>e.source===n.id&&e.predicate===p),`${n.sourceId}: ${p}`);assert(n.raw.hasNormativeForce);}
 assert.equal(find('req:gost_13579_2018:013').raw.hasValue.numericValue,12);
 assert.deepEqual(find('req:gost_13579_2018:003').raw.hasValue.map(v=>v.numericValue),[2380,1180,880]);
 assert.equal(find('req:gost_13579_2018:012').raw.hasValue,true);
});
test('quantitative values are real linked nodes with units, not discarded objects',()=>{
 const r=find('req:gost_13579_2018:003');
 const links=graph.edges.filter(e=>e.source===r.id&&e.predicate==='hasValue');assert.equal(links.length,3);
 for(const e of links){const n=graph.nodes.find(n=>n.id===e.target);assert.equal(n.type,'QuantitativeValue');assert(graph.edges.some(e=>e.source===n.id&&e.predicate==='unit'&&e.target===find('unit:mm').id));}
});
test('two model namespaces remain distinct even for equal labels',()=>{
 const strength=graph.nodes.filter(n=>n.label==='Класс бетона по прочности на сжатие');assert(strength.some(n=>n.group==='document'));assert(strength.some(n=>n.group==='ontology'));assert(new Set(strength.map(n=>n.iri)).size>1);
});
test('@type and aliased type both produce type edges',()=>{
 assert(graph.edges.some(e=>e.predicate==='type'&&e.source.startsWith('ontology|')));
 assert(graph.edges.some(e=>e.predicate==='type'&&e.source===find('obj:fbs_block').id));
});
test('split statements for one ontology IRI are combined without losing properties',()=>{
 const n=graph.nodes.find(n=>n.iri==='https://example.org/construction-norms/domain/BasementWallBlock');
 assert(Array.isArray(n.raw.hasPropertyType));assert(n.raw.hasPropertyType.length>=9);
 assert(graph.edges.filter(e=>e.source===n.id&&e.predicate==='hasPropertyType').length>=9);
});
test('portable bundle survives roundtrip and validates endpoint integrity',()=>{
 const bundle=toWorkbench(graph),round=fromWorkbench(JSON.parse(JSON.stringify(bundle)));
 assert.equal(round.nodes.length,graph.nodes.length);assert.equal(round.edges.length,graph.edges.length);
 assert.deepEqual(round.nodes.find(n=>n.id===find('req:gost_13579_2018:003').id).raw,find('req:gost_13579_2018:003').raw);
 for(const file of graph.files)assert.equal(round.meta.localSources[file.path],graph.meta.localSources[file.path]);
 const broken=structuredClone(bundle);broken.artifacts.relationships[0].target='does-not-exist';assert.throws(()=>fromWorkbench(broken),/отсутствующая/);
 const duplicate=structuredClone(bundle);duplicate.artifacts.entities.push(duplicate.artifacts.entities[0]);assert.throws(()=>fromWorkbench(duplicate),/уникальными/);
});
test('semantic path links FBS to an allowed length and search finds Cyrillic labels',()=>{
 const filtered={...graph,edges:graph.edges.filter(e=>!['type','definedIn','statedIn','domain','range'].includes(e.predicate))};
 const result=shortestPath(filtered,find('obj:fbs_block').id,find('prop:length').id);assert(result);assert.equal(result.edges.length,2);assert(result.nodes.includes(find('req:gost_13579_2018:003').id));
 assert(searchNodes(graph,'ФБС','document').some(n=>n.sourceId==='obj:fbs_block'));
});
test('local contexts resolve safely and equal labels never merge different identifiers',()=>{
 const files=[{path:'model/documents/demo/core.jsonld',data:{'@context':{ex:'https://test.org/','id':'@id','type':'@type',appliesTo:{'@id':'ex:appliesTo','@type':'@id'}}}},
 {path:'model/documents/demo/a.jsonld',data:{'@context':'core.jsonld','@graph':[{id:'ex:a',label:'Одинаково',type:'ex:Thing',appliesTo:'ex:b'},{id:'ex:b',label:'Одинаково'}]}}];
 const g=ingest(files);assert(g.nodes.some(n=>n.iri==='https://test.org/a'));assert.equal(g.nodes.filter(n=>n.label==='Одинаково').length,2);assert(g.edges.some(e=>e.predicate==='appliesTo'&&e.target==='document|https://test.org/b'));
});
test('raw snapshot hashes match and all source files exist',async()=>{
 const {createHash}=await import('node:crypto');for(const file of graph.files){const raw=await fs.readFile(path.resolve('public/data/raw',file.path));assert.equal(createHash('sha256').update(raw).digest('hex'),file.sha256,file.path);}
 assert.equal(graph.files.length,21);
});
