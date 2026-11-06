// Source of truth for the 20 compact, watertight ore GLBs.
// Node: import { writeFileSync, mkdirSync } from 'node:fs'; then call buildOreGlb.
// Each model is an authored family silhouette with three light, reproducible variants.
export const ORE_SHAPE_FAMILIES = ['river', 'frost', 'coal', 'meteor', 'ochre'];
export const ORE_SHAPE_VARIANTS = ['base', 'flat', 'ridge', 'offset'];

const normalize = p => { const l = Math.hypot(...p); return p.map(v => v/l); };
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((v,n,i)=>v+n*b[i],0);

export function buildOreGlb(family, variant=0) {
  const fi = ORE_SHAPE_FAMILIES.indexOf(family);
  if(fi<0 || !Number.isInteger(variant) || variant<0 || variant>3) throw new Error('Invalid ore shape');
  const t=(1+Math.sqrt(5))/2;
  let points=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(normalize);
  let faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let level=0;level<3;level++){
    const middle=new Map(); const midpoint=(a,b)=>{
      const key=a<b?a+':'+b:b+':'+a;
      if(middle.has(key))return middle.get(key);
      const next=points.length; points.push(normalize(points[a].map((n,i)=>(n+points[b][i])/2)));middle.set(key,next);return next;
    };
    const next=[];
    for(const [a,b,c] of faces){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
      next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}
    faces=next;
  }
  // Five deliberately different geological masses. Broad planes are bevelled by
  // the sampling mesh; shallow erosion belongs to the shape, not random spikes.
  const dims=[[.84,.43,.58],[.61,.70,.51],[.77,.51,.61],[.67,.57,.61],[.86,.37,.63]][fi];
  const powers=[1.0,.63,.56,.92,.68];
  const signedPow=(v,e)=>Math.sign(v)*Math.pow(Math.abs(v),e);
  const cleaves=[
    [[[.12,-1,.10],.83],[[.68,.30,-.63],.95]],
    [[[1,.28,.18],.82],[[-1,.06,.3],.84],[[.17,1,.22],.87],[[.3,.28,-1],.85],[[.12,-1,.2],.83]],
    [[[.95,.4,.15],.85],[[-.85,.4,-.3],.89],[[.1,1,.3],.81],[[.3,-1,.1],.82],[[-.1,.2,1],.86]],
    [[[.6,-.75,-.2],.88],[[-.7,.3,-.5],.93]],
    [[[.12,1,.08],.79],[[.05,-1,.15],.78],[[.9,.1,-.4],.94],[[-.8,.3,.2],.90]],
  ][fi];
  const phase=fi*1.73+variant*.34;
  points=points.map(p=>{
    const [u,v,w]=p;
    const angle=Math.atan2(w,u);
    const broad=Math.sin(u*3.4+v*1.7+phase)*Math.cos(w*3.1-v*.7-phase);
    let q=p.map(n=>signedPow(n,powers[fi]));
    let radius=1+.045*broad;
    // Smooth clipping preserves large cleaved faces without a gem-like triangulation.
    for(const [normal,limit] of cleaves){
      const direction=dot(q,normalize(normal));
      if(direction>limit) radius=Math.min(radius,limit/direction);
    }
    q=q.map(n=>n*radius);
    if(fi===0){
      q[1]*=1-.10*u; q[2]*=1+.07*u;
      q[1]-=.035*Math.exp(-((u+.18)**2+(w-.35)**2)*15);
    }else if(fi===1){
      q[0]+=.18*Math.max(0,v); q[2]+=.08*v;
      q[0]-=.045*Math.exp(-((v-.25)**2+(w-.4)**2)*19);
    }else if(fi===2){
      q[1]+=.11*u;
      const fracture=Math.exp(-(((v+.10-u*.13)/.06)**2))*Math.max(0,w);
      q[2]-=.065*fracture;
      q[1]-=.045*Math.exp(-((u-.4)**2+(w-.2)**2)*16);
    }else if(fi===3){
      const centers=[[.62,.40,.68],[-.48,.68,.51],[.02,-.3,.96],[-.75,-.3,.5],[.7,-.3,-.4]];
      const dent=centers.reduce((sum,c)=>sum+Math.exp(-(1-dot(p,normalize(c)))*55),0);
      q=q.map(n=>n*(1-.095*dent));q[0]+=.05*v; q[1]+=.04*u;
    }else{
      const ledge=.027*Math.sin(v*19+phase)+.018*Math.sin(v*31+1.2);
      q[0]*=1+ledge; q[2]*=1+ledge;
      q[1]+=.08*u;
    }
    const erosion=(fi===0?.004:.009)*Math.sin(u*23+phase)*Math.sin(v*18-w*13)*Math.cos(w*21);
    q=q.map(n=>n*(1+erosion));
    if(q[1]<-.72)q[1]=-.72+(q[1]+.72)*.34;
    const wide=variant===1?1.07:variant===2?.95:1;
    const tall=variant===1?.90:variant===2?1.10:1;
    let [x,y,z]=q.map((n,i)=>n*dims[i]);
    x*=wide;y*=tall;
    if(variant===2){y+=.045*Math.max(0,w);z*=.97;}
    if(variant===3){x+=y*.18;z+=u*.045;y+=u*.025;}
    return [x,y,z];
  });
  const normals=points.map(()=>[0,0,0]);
  const indices=[];
  for(const face of faces){
    let [a,b,c]=face;
    let normal=cross(sub(points[b],points[a]),sub(points[c],points[a]));
    const center=points[a].map((n,i)=>(n+points[b][i]+points[c][i])/3);
    if(dot(normal,center)<0){[b,c]=[c,b];normal=normal.map(n=>-n);}
    indices.push(a,b,c);
    for(const k of [a,b,c]) for(let j=0;j<3;j++)normals[k][j]+=normal[j];
  }
  const position = new Float32Array(points.flat());
  const normal = new Float32Array(normals.map(normalize).flat());
  const index = new Uint16Array(indices);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  points.forEach(v=>v.forEach((n,i)=>{min[i]=Math.min(n,min[i]);max[i]=Math.max(n,max[i]);}));
  const plen=position.byteLength, nlen=normal.byteLength, ilen=index.byteLength, binLen=plen+nlen+ilen;
  const gltf={
    asset:{version:'2.0',generator:'BladeLab V5 bevelled geological specimens'},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'ore_'+family+'_'+variant}],
    meshes:[{name:family+'_rock',primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0,mode:4}]}],
    materials:[{name:'raw mineral substrate',pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1],roughnessFactor:.88,metallicFactor:.1},doubleSided:true}],
    buffers:[{byteLength:binLen}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:plen,target:34962},{buffer:0,byteOffset:plen,byteLength:nlen,target:34962},{buffer:0,byteOffset:plen+nlen,byteLength:ilen,target:34963}],
    accessors:[{bufferView:0,componentType:5126,count:points.length,type:'VEC3',min,max},
      {bufferView:1,componentType:5126,count:points.length,type:'VEC3'},
      {bufferView:2,componentType:5123,count:index.length,type:'SCALAR'}]
  };
  const json=JSON.stringify(gltf), jsonPad=(4-json.length%4)%4;
  const jsonLen=json.length+jsonPad, binPad=(4-binLen%4)%4;
  const total=12+8+jsonLen+8+binLen+binPad;
  const glb=new Uint8Array(total),view=new DataView(glb.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);
  view.setUint32(12,jsonLen,true);view.setUint32(16,0x4e4f534a,true);
  for(let i=0;i<json.length;i++)glb[20+i]=json.charCodeAt(i);
  for(let i=0;i<jsonPad;i++)glb[20+json.length+i]=32;
  const offset=20+jsonLen;
  view.setUint32(offset,binLen+binPad,true);view.setUint32(offset+4,0x004e4942,true);
  glb.set(new Uint8Array(position.buffer),offset+8);
  glb.set(new Uint8Array(normal.buffer),offset+8+plen);
  glb.set(new Uint8Array(index.buffer),offset+8+plen+nlen);
  return glb;
}
export function encodeOreBase64(bytes) {
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let str='';
  for(let i=0;i<bytes.length;i+=3){
    const a=bytes[i], b=i+1<bytes.length?bytes[i+1]:0, c=i+2<bytes.length?bytes[i+2]:0;
    str+=chars[a>>>2]+chars[((a&3)<<4)|(b>>>4)]+(i+1<bytes.length?chars[((b&15)<<2)|(c>>>6)]:'=')+(i+2<bytes.length?chars[c&63]:'=');
  }
  return str;
}
