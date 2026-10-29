import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ingest,toWorkbench} from '../src/core/ingest.mjs';
const source=path.resolve(process.argv[2]??'public/data/raw');
async function walk(dir){const all=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.name==='.git')continue;const p=path.join(dir,e.name);if(e.isDirectory())all.push(...await walk(p));else if(e.name.endsWith('.jsonld'))all.push(p);}return all;}
const files=[];
for(const p of (await walk(source)).sort()) {
 const relative=path.relative(source,p),text=await fs.readFile(p,'utf8');
 files.push({path:relative,data:JSON.parse(text),text,sha256:crypto.createHash('sha256').update(text).digest('hex')});
 const target=path.resolve('public/data/raw',relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);
}
let commit;
try {commit=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
catch {commit=JSON.parse(await fs.readFile('public/data/graph.json','utf8')).meta.commit??null;}
const meta={repository:'https://github.com/f0k3s/dissertation',commit,importedAt:new Date().toISOString(),title:'Семантическая модель ГОСТ 13579-2018',adapterVersion:1,localSources:Object.fromEntries(files.map(f=>[f.path,f.text]))};
const graph=ingest(files,meta);
await fs.mkdir('public/data',{recursive:true});
await fs.writeFile('public/data/graph.json',JSON.stringify(graph));
await fs.writeFile('public/data/dissertation.graphrag.json',JSON.stringify(toWorkbench(graph)));
await fs.mkdir('public/data/workbench',{recursive:true});
for(const [name,rows]of Object.entries(toWorkbench(graph).artifacts))await fs.writeFile(`public/data/workbench/${name}.json`,JSON.stringify(rows));
await fs.copyFile(path.join(source,'README.md'),'public/data/README-source.md');
console.log(JSON.stringify({files:files.length,nodes:graph.nodes.length,edges:graph.edges.length,groups:Object.fromEntries(['document','ontology','archive'].map(g=>[g,{nodes:graph.nodes.filter(n=>n.group===g).length,defined:graph.nodes.filter(n=>n.group===g&&!n.external).length,edges:graph.edges.filter(e=>e.source.startsWith(g+'|')).length}])),issues:graph.issues.length},null,2));
