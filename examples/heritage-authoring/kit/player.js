(() => {
'use strict';
const K=HeritageKit,D=HeritagePlayerData,skulls=new Set(['skeleton_skull','wither_skeleton_skull','player_head','zombie_head','creeper_head','dragon_head','piglin_head'].map(name=>'minecraft:'+name));
const rotateX=(p,a)=>[p[0],p[1]*Math.cos(a)-p[2]*Math.sin(a),p[1]*Math.sin(a)+p[2]*Math.cos(a)];
const rotateY=(p,a)=>[p[0]*Math.cos(a)+p[2]*Math.sin(a),p[1],p[2]*Math.cos(a)-p[0]*Math.sin(a)];
const rotateZ=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]];
function matrix(p,m){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function equipment(kit) {
  const slots=new Map((Array.isArray(kit.items)?kit.items:[]).filter(entry=>(entry.inventory??'player')==='player').map(entry=>[entry.index,entry.item]));
  const armor=new Map();
  for(const [index,type] of [[36,'feet'],[37,'legs'],[38,'chest'],[39,'head']]){
    const stack=slots.get(index),data=stack&&K.items.get(K.normalize(stack.id));
    if(data?.armor===type)armor.set(index,stack);
  }
  return {main:slots.get(kit.selected_slot??0),off:slots.get(40),head:armor.has(39)?null:slots.get(39),chest:slots.get(38),armor};
}
function arm(point,side,holding) {
  const pivot=side*5,q=rotateZ(rotateX([point[0]-pivot,point[1]-10,point[2]],holding?-Math.PI/10:0),-side*.1);
  return [q[0]+pivot,q[1]+10,q[2]];
}
function hand(point,side,transform) {
  const p=matrix(point,transform),q=rotateX(rotateY([p[0]*16-side,p[1]*16+2,p[2]*16-10],Math.PI),-Math.PI/2);
  return arm([side*5+q[0],10+q[1],q[2]],side,true);
}
function head(point,yaw,pitch) {
  const q=rotateX(rotateY([point[0],point[1]-8,point[2]],yaw*.35),-pitch*.3);
  return [q[0],q[1]+8,q[2]];
}
function headItem(point,id,transform) {
  if(skulls.has(id))return [point[0]*19,-(point[1]+.5)*19+8,-point[2]*19];
  const p=matrix(point,transform);
  return [-p[0]*10,8-4-p[1]*10,p[2]*10];
}
function guiScale(width,available,pixelRatio=1) {
  const ratio=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1,max=Math.max(1,Math.floor(4*ratio)),fit=Math.floor(Math.max(0,available)*ratio/width);
  return Math.min(max,Math.max(1,fit));
}
function visible(points) {const [a,b,,d]=points;return (b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0])<-1e-7;}
function quads(buffer,range) {
  const view=new DataView(buffer),start=range[0]*D.stride,end=start+range[1]*D.stride;
  if(start<0||end>buffer.byteLength||buffer.byteLength%D.stride)throw new Error('Invalid player geometry range.');
  const faces=[];
  for(let offset=start;offset<end;offset+=D.stride){
    const texture=view.getUint32(offset,true),color=view.getUint32(offset+4,true),points=[],uv=[];
    if(!D.textures[texture])throw new Error('Invalid player texture index.');
    for(let vertex=0;vertex<4;vertex++){
      const at=offset+8+vertex*20;points.push([0,4,8].map(n=>view.getFloat32(at+n,true)));uv.push([view.getFloat32(at+12,true),view.getFloat32(at+16,true)]);
    }
    faces.push({texture,color,points,uv});
  }
  return faces;
}
const api={equipment,arm,hand,head,headItem,quads,matrix,visible,guiScale};
globalThis.HeritagePlayer=api;
if(typeof module!=='undefined')module.exports=api;
})();
