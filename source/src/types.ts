export interface Node {id:string;iri:string;sourceId:string;label:string;type:string;category:string;group:string;sources:string[];raw:Record<string,any>;anonymous:boolean;external:boolean;degree:number;pointer:string}
export interface Edge {id:string;source:string;target:string;predicate:string;label:string;sources:string[]}
export interface SourceFile {path:string;sha256:string;bytes:number;group:string;nodeCount:number}
export interface Graph {nodes:Node[];edges:Edge[];files:SourceFile[];issues:{level:string;code:string;message:string;nodeId?:string;file?:string}[];meta:{repository?:string;commit?:string;importedAt?:string;imported?:boolean;[key:string]:any}}
