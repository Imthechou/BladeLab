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
  for(let level=0;level<2;level++){
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
  const dims=[[.70,.53,.58],[.58,.70,.57],[.70,.53,.62],[.63,.60,.60],[.72,.44,.64]][fi];
  const phase=fi*1.63+variant*.59;
  points=points.map(p=>{
    const [u,v,w]=p;
    const broad=Math.sin(u*4.5+v*2.2+phase)*Math.cos(w*3.8-v*.8-phase);
    const shoulder=Math.sin(v*5.1-w*2.2+phase*1.4)*Math.cos(u*3.6+phase);
    let radius=1+.045*broad+.033*shoulder;
    if(fi===0){ // river: rounded water-worn ellipsoid and subtle shallow plane
      radius+=.018*Math.sin(u*7.2+phase)*Math.cos(v*3.4);
    }else if(fi===1){ // frost: broad prism shoulders with no exaggerated spikes
      radius+=.067*Math.cos(Math.atan2(w,u)*5+phase)*(.35+.65*Math.abs(v));
    }else if(fi===2){ // coal: broad broken ledges and pressure-squeezed silhouette
      radius+=.072*Math.sin(u*5.5+w*3.8+phase)*Math.sin(v*3.4+phase);
    }else if(fi===3){ // meteorite: shallow fusion-crust dimples, not a noise ball
      const dent=([.68,.28,.55],[-.22,.81,-.48],[-.77,-.39,.48])
        .reduce((sum,c)=>{const d=dot(p,normalize(c)); return sum+Math.exp(-(1-d)*48);},0);
      radius-=.11*dent;
    }else{ // ochre: compressed sedimentary nodule with long strata
      radius+=.055*Math.sin(v*6.5+phase)*Math.cos(u*2.8+w*2.7);
    }
    if(variant===1)radius+=.027*Math.sin(u*7+phase); // low, broader stone
    if(variant===2)radius+=.031*Math.cos(w*5+v*3+phase); // long ridge
    if(variant===3)radius+=.028*Math.sin(u*4-w*6+phase); // slightly off-center
    const flat=variant===1?.92:variant===2?1.07:1;
    const wide=variant===1?1.06:variant===2?.98:1;
    let x=u*dims[0]*radius*wide;
    let y=v*dims[1]*radius*flat;
    let z=w*dims[2]*radius;
    if(fi===0)y-=Math.max(0,-v-.5)*.065; // settle naturally on one face
    if(fi===1){x+=Math.max(0,v)*.07;z+=u*.04;}
    if(fi===2){y+=u*.047;z*=.95;}
    if(fi===3)y+=u*.035;
    if(fi===4){y+=u*.035;z*=1+.035*Math.sin(v*5+phase);}
    if(variant===3){x+=y*.13;z+=u*.035;}
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
    asset:{version:'2.0',generator:'BladeLab handcrafted compact mineral geometry'},
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
