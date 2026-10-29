import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {GraphData} from './vendor/graphData';
import type {Graph} from './types';
import {CATEGORY} from './core/ingest.mjs';
const palette:Record<string,{label:string;color:string}>=CATEGORY;
import {layoutGraph,type Positioned} from './core/layout';

export class GraphView {
  private renderer?:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(45,1,1,4000);
  private controls?:OrbitControls;
  private resize:ResizeObserver;
  private nodes:Positioned[]=[];
  private meshes=new Map<string,THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>>();
  private labels=new Map<string,HTMLDivElement>();
  private labelsRoot:HTMLDivElement;
  private line?:THREE.LineSegments;
  private graph?:Graph;
  private selected='';
  private active=new Set<string>();
  private path=new Set<string>();
  private labelMode=true;
  private twoD=false;
  private fallback?:HTMLCanvasElement;
  private fallbackZoom=1;
  private fallbackYaw=.2;
  private fallbackPitch=.12;
  private fallbackCenter={x:0,y:0,z:0};
  private fallbackDrag={x:0,y:0,distance:0};
  private raycaster=new THREE.Raycaster();
  private animation=0;
  private paused=false;
  private pointerStart={x:0,y:0};
  private disposed=false;
  constructor(private host:HTMLElement,private onSelect:(id:string)=>void,private onReady:(webgl:boolean)=>void) {
    this.labelsRoot=document.createElement('div');this.labelsRoot.className='graph-labels';host.append(this.labelsRoot);
    this.camera.position.set(20,35,500);
    try {
      const canvas=document.createElement('canvas');
      const context=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'low-power'});
      if(!context)throw new Error('Use compatible canvas renderer');
      this.renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:true,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
      this.renderer.setClearColor(0x000000,0);host.prepend(this.renderer.domElement);
      this.controls=new OrbitControls(this.camera,this.renderer.domElement);
      this.controls.enableDamping=true;this.controls.dampingFactor=.08;
      this.controls.minDistance=35;this.controls.maxDistance=1800;this.controls.autoRotate=false;
      this.controls.autoRotateSpeed=.25;
      this.renderer.domElement.addEventListener('pointerdown',e=>{this.pointerStart={x:e.clientX,y:e.clientY};});
      this.renderer.domElement.addEventListener('pointerup',e=>this.pick(e));
      this.renderer.domElement.addEventListener('pointermove',e=>{
        if(e.buttons)return;const hit=this.hit(e);this.renderer!.domElement.style.cursor=hit?'pointer':'grab';
      });
      this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.enableFallback();});
    } catch {this.enableFallback();}
    this.resize=new ResizeObserver(()=>this.size());this.resize.observe(host);this.size();this.animate();
    onReady(Boolean(this.renderer));
  }
  private enableFallback() {
    if(this.fallback)return;
    if(this.renderer)this.renderer.domElement.style.display='none';
    this.fallback=document.createElement('canvas');this.fallback.className='fallback-canvas';this.host.prepend(this.fallback);
    this.fallback.style.touchAction='none';this.fallback.style.cursor='grab';
    this.labelsRoot.style.display='none';
    this.fallback.addEventListener('pointerdown',e=>{this.fallbackDrag={x:e.clientX,y:e.clientY,distance:0};this.fallback!.setPointerCapture(e.pointerId);});
    this.fallback.addEventListener('pointermove',e=>{if(!e.buttons)return;const dx=e.clientX-this.fallbackDrag.x,dy=e.clientY-this.fallbackDrag.y;this.fallbackDrag.distance+=Math.abs(dx)+Math.abs(dy);this.fallbackDrag.x=e.clientX;this.fallbackDrag.y=e.clientY;if(!this.twoD){this.fallbackYaw+=dx*.008;this.fallbackPitch+=dy*.008;this.drawFallback();}});
    this.fallback.addEventListener('pointerup',e=>{if(this.fallbackDrag.distance>5)return;const rect=this.fallback!.getBoundingClientRect();const n=[...this.nodes].sort((a,b)=>this.projectFallback(a).depth-this.projectFallback(b).depth).find(n=>{const p=this.projectFallback(n);return Math.hypot(e.clientX-rect.left-p.x,e.clientY-rect.top-p.y)<Math.max(10,n.radius*1.5);});if(n)this.onSelect(n.id);});
    this.fallback.addEventListener('wheel',e=>{e.preventDefault();this.fallbackZoom=Math.max(.2,Math.min(6,this.fallbackZoom*(e.deltaY>0?.9:1.1)));this.drawFallback();},{passive:false});
    this.onReady(false);this.size();
  }
  setData(graph:Graph,upstream?:GraphData) {
    this.graph=graph;
    for(const mesh of this.meshes.values()){mesh.geometry.dispose();mesh.material.dispose();this.scene.remove(mesh);}
    this.meshes.clear();this.labelsRoot.replaceChildren();this.labels.clear();
    if(this.line){this.line.geometry.dispose();(this.line.material as THREE.Material).dispose();this.scene.remove(this.line);}
    this.nodes=layoutGraph(graph,upstream);
    for(const node of this.nodes) {
      const material=new THREE.MeshBasicMaterial({color:palette[node.category]?.color??'#83b4c2',transparent:true});
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(node.radius,14,10),material);mesh.position.set(node.x,node.y,node.z);mesh.userData.id=node.id;
      this.scene.add(mesh);this.meshes.set(node.id,mesh);
      const label=document.createElement('div');label.className='graph-label';label.textContent=node.label;label.style.setProperty('--node-color',palette[node.category]?.color??'#83b4c2');
      this.labelsRoot.append(label);this.labels.set(node.id,label);
    }
    const geometry=new THREE.BufferGeometry();const positions=new Float32Array(graph.edges.length*6),colors=new Float32Array(graph.edges.length*6);
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.72}));this.scene.add(this.line);
    this.highlight(this.selected,this.path);this.reset();
  }
  highlight(id:string,path=new Set<string>()) {
    this.selected=id;this.path=path;this.active=new Set([id]);
    for(const e of this.graph?.edges??[])if(e.source===id||e.target===id){this.active.add(e.source);this.active.add(e.target);}
    for(const [key,mesh]of this.meshes){mesh.material.opacity=!id||this.active.has(key)||path.has(key)?1:.36;mesh.scale.setScalar(key===id?1.55:path.has(key)?1.2:1);}
    this.updateLines();this.drawFallback();
  }
  private updateLines() {
    if(!this.graph||!this.line)return;
    const positions=this.line.geometry.getAttribute('position'),colors=this.line.geometry.getAttribute('color');
    for(const [i,e]of this.graph.edges.entries()) {
      const a=this.meshes.get(e.source),b=this.meshes.get(e.target);if(!a||!b)continue;
      positions.setXYZ(i*2,...a.position.toArray() as [number,number,number]);positions.setXYZ(i*2+1,...b.position.toArray() as [number,number,number]);
      const selected=e.source===this.selected||e.target===this.selected,route=this.path.has(e.source)&&this.path.has(e.target);
      const color=new THREE.Color(route?'#d5b3ff':selected?'#64c5b0':this.selected?'#17252e':'#304858');
      colors.setXYZ(i*2,color.r,color.g,color.b);colors.setXYZ(i*2+1,color.r,color.g,color.b);
    }
    positions.needsUpdate=true;colors.needsUpdate=true;this.line.geometry.computeBoundingSphere();
  }
  setLabels(value:boolean){this.labelMode=value;this.drawFallback();}
  setMode(twoD:boolean) {
    this.twoD=twoD; if(this.controls){this.controls.enableRotate=!twoD;if(twoD){this.camera.position.set(0,0,500);this.controls.target.set(0,0,0);}}
    for(const n of this.nodes)this.meshes.get(n.id)?.position.set(n.x,n.y,twoD?0:n.z);
    this.updateLines();this.drawFallback();
  }
  zoom(factor:number){if(this.fallback){this.fallbackZoom*=factor;this.drawFallback();}else{this.camera.position.sub(this.controls!.target).multiplyScalar(1/factor).add(this.controls!.target);}}
  reset(){this.fallbackZoom=1;this.fallbackCenter={x:0,y:0,z:0};const extent=this.nodes.reduce((v,n)=>Math.max(v,Math.hypot(n.x,n.y,n.z)),130);this.camera.position.set(this.twoD?0:extent*.1,this.twoD?0:extent*.16,Math.max(420,extent*2.9));this.controls?.target.set(0,0,0);this.controls?.update();this.drawFallback();}
  focus(id:string){if(this.fallback){const n=this.nodes.find(n=>n.id===id);if(n){this.fallbackCenter={x:n.x,y:n.y,z:n.z};this.fallbackZoom=1.8;this.drawFallback();}return;}const m=this.meshes.get(id);if(!m||!this.controls)return;const delta=this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(150);this.controls.target.copy(m.position);this.camera.position.copy(m.position.clone().add(delta));this.controls.update();}
  private hit(event:PointerEvent){if(!this.renderer)return;const rect=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);return this.raycaster.intersectObjects([...this.meshes.values()])[0]?.object.userData.id as string|undefined;}
  private pick(event:PointerEvent){if(Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)>5)return;const id=this.hit(event);if(id)this.onSelect(id);}
  private size(){const {width,height}=this.host.getBoundingClientRect();if(width<1||height<1)return;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer?.setSize(width,height);if(this.fallback){this.fallback.width=width*devicePixelRatio;this.fallback.height=height*devicePixelRatio;this.fallback.style.width=`${width}px`;this.fallback.style.height=`${height}px`;this.drawFallback();}}
  private animate=()=>{if(this.disposed)return;this.animation=requestAnimationFrame(this.animate);if(this.paused||this.fallback)return;this.controls?.update();this.renderer?.render(this.scene,this.camera);const {width,height}=this.host.getBoundingClientRect();
    const visible=this.nodes.filter(n=>n.id===this.selected||this.path.has(n.id)||this.active.has(n.id)&&n.degree>6).slice(0,10);
    const labels=new Set((this.selected?visible:[...this.nodes].sort((a,b)=>b.degree-a.degree).slice(0,7)).map(n=>n.id));
    for(const n of this.nodes){const label=this.labels.get(n.id)!;if(!this.labelMode||!labels.has(n.id)){label.style.display='none';continue;}const p=this.meshes.get(n.id)!.position.clone().project(this.camera);label.style.display=p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1?'none':'block';label.classList.toggle('selected',n.id===this.selected);label.style.transform=`translate(${(p.x*.5+.5)*width+n.radius+7}px,${(-p.y*.5+.5)*height-7}px)`;}
  };
  private projectFallback(n:Positioned){const box=this.host.getBoundingClientRect();const extent=this.nodes.reduce((v,n)=>Math.max(v,Math.hypot(n.x,n.y,n.z)),80);const scale=Math.min(box.width,box.height)/(extent*2.15)*this.fallbackZoom;const nx=n.x-this.fallbackCenter.x,ny=n.y-this.fallbackCenter.y,nz=n.z-this.fallbackCenter.z;const x=this.twoD?nx:Math.cos(this.fallbackYaw)*nx+Math.sin(this.fallbackYaw)*nz,z=this.twoD?0:-Math.sin(this.fallbackYaw)*nx+Math.cos(this.fallbackYaw)*nz,y=this.twoD?ny:Math.cos(this.fallbackPitch)*ny-Math.sin(this.fallbackPitch)*z,depth=this.twoD?0:Math.sin(this.fallbackPitch)*ny+Math.cos(this.fallbackPitch)*z;const perspective=this.twoD?1:Math.max(.35,Math.min(3,400/(400+depth)));return{x:box.width/2+x*scale*perspective,y:box.height/2+y*scale*perspective,depth,scale:perspective};}
  private drawFallback(){
    if(!this.fallback||!this.graph)return;const ctx=this.fallback.getContext('2d');if(!ctx)return;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,this.fallback.width,this.fallback.height);
    const map=new Map(this.nodes.map(n=>[n.id,n]));
    for(const e of this.graph.edges){const a=map.get(e.source),b=map.get(e.target);if(!a||!b)continue;const p=this.projectFallback(a),q=this.projectFallback(b);const active=e.source===this.selected||e.target===this.selected,route=this.path.has(e.source)&&this.path.has(e.target);ctx.strokeStyle=route?'#bca2dc':active?'#5b9e92':'#2f4454';ctx.globalAlpha=(active||route)? .8 : .5;ctx.lineWidth=active?1.2:.8;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    for(const n of [...this.nodes].sort((a,b)=>this.projectFallback(b).depth-this.projectFallback(a).depth)){const p=this.projectFallback(n);ctx.fillStyle=palette[n.category]?.color??'#91bfce';ctx.globalAlpha=!this.selected||this.active.has(n.id)||this.path.has(n.id)?1:.43;const radius=n.radius*p.scale*(n.id===this.selected?1.6:1);if(n.id===this.selected){ctx.shadowColor=palette[n.category]?.color??'#91bfce';ctx.shadowBlur=17;}ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.5,radius),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    if(this.labelMode){const used:{x:number;y:number;w:number;h:number}[]=[];const ns=[...this.nodes].sort((a,b)=>(b.id===this.selected?1000:0)+b.degree-((a.id===this.selected?1000:0)+a.degree));ctx.font='10px system-ui';ctx.globalAlpha=1;for(const n of ns.slice(0,10)){const p=this.projectFallback(n),text=n.label.length>31?n.label.slice(0,30)+'…':n.label;const rect={x:p.x+10,y:p.y-12,w:ctx.measureText(text).width+10,h:18};if(used.some(r=>rect.x<r.x+r.w+6&&rect.x+rect.w+6>r.x&&rect.y<r.y+r.h+3&&rect.y+rect.h+3>r.y))continue;used.push(rect);ctx.fillStyle=n.id===this.selected?'#254b42ed':'#14222ddb';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);ctx.fillStyle=n.id===this.selected?'#c5ebde':'#8ba5b8';ctx.fillText(text,rect.x+5,rect.y+12);}}
    ctx.globalAlpha=1;
  }
  setPaused(value:boolean){this.paused=value;}
  dispose(){this.disposed=true;cancelAnimationFrame(this.animation);this.resize.disconnect();this.controls?.dispose();for(const m of this.meshes.values()){m.geometry.dispose();m.material.dispose();}this.line?.geometry.dispose();if(this.line)(this.line.material as THREE.Material).dispose();this.renderer?.dispose();}
}
