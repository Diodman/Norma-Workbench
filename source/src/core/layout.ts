/** Adapted from Lyon Industries GraphRAG Workbench ForceSimulation3D (MIT).
 * Keeps ID-based links and degree-scaled nodes; explicitly uses all 3 dimensions.
 * Category clusters are UI groupings, not LLM-extracted GraphRAG communities.
 */
import * as d3 from 'd3-force-3d';
import type {Entity, GraphData} from '../vendor/graphData';
import type {Graph,Node} from '../types';
export interface Positioned extends Node {x:number;y:number;z:number;radius:number}
export function layoutGraph(graph:Graph,upstream?:GraphData):Positioned[] {
  const entities=new Map<string,Entity>((upstream?.entities??[]).map(n=>[n.id,n]));
  const nodes=graph.nodes.map((n,i)=>{
    const phi=Math.acos(1-2*(i+.5)/graph.nodes.length),theta=i*Math.PI*(3-Math.sqrt(5));
    const degree=entities.get(n.id)?.degree??n.degree;
    return {...n,x:135*Math.sin(phi)*Math.cos(theta),y:135*Math.sin(phi)*Math.sin(theta),z:135*Math.cos(phi),radius:Math.min(5.8,2.6+Math.sqrt(degree)*.38)};
  });
  const links=graph.edges.map(e=>({...e}));
  const sim=d3.forceSimulation(nodes,3).stop()
    .force('link',d3.forceLink(links).id((n:Positioned)=>n.id).distance((e:any)=>e.predicate==='type'?48:36).strength(.15))
    .force('charge',d3.forceManyBody().strength((n:Positioned)=>-55-n.degree*2.5))
    .force('center',d3.forceCenter(0,0,0).strength(.04))
    .force('collision',d3.forceCollide().radius((n:Positioned)=>n.radius+5))
    .force('origin',(alpha:number)=>{for(const n of nodes as any[]){n.vx-=n.x*.018*alpha;n.vy-=n.y*.018*alpha;n.vz-=n.z*.018*alpha;}}).alphaDecay(.035);
  sim.tick(200);sim.stop();
  return nodes;
}
