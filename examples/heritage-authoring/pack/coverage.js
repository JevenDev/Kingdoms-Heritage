(() => {
'use strict';
const F=typeof module!=='undefined'?require('./flow.js'):HeritageFlow;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function hash(value){const text=ArrayBuffer.isView(value)?value:typeof value==='string'?value:JSON.stringify(canonical(value));let a=2166136261,b=2654435769;for(let index=0;index<text.length;index++){const code=typeof text==='string'?text.charCodeAt(index):text[index];a=Math.imul(a^code,16777619);b=Math.imul(b^code,2246822519);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function pictures(output){return Object.fromEntries((output.resourceFiles??[]).map(file=>[file.path,hash(file.content)]));}
function scene(choices,images,spawnId,kitId,poolIndex=null){
  const spawn=choices.spawns.find(entry=>entry.id===spawnId),kit=choices.kits.find(entry=>entry.id===kitId);if(!spawn||!kit||spawn.kits&&!spawn.kits.includes(kit.id))return null;
  if(spawn.type!=='pool')poolIndex=null;else if(!Number.isInteger(poolIndex)||!spawn.pool[poolIndex])return null;
  const arrival=F.destination(spawn,poolIndex??0),{intro,...destination}=arrival,{pool,intro:defaultIntro,...card}=spawn;
  const image=spawn.image?.split(':'),picture=image?images['assets/'+image[0]+'/'+image[1]]??'external':null,scale=choices.guiScale??0;
  const kitInputs=[kit,choices.kits.filter(entry=>!spawn.kits||spawn.kits.includes(entry.id)).map(entry=>entry.id),scale];
  if(choices.kitPreview==='model')kitInputs.push('model');
  if(kit.shop)kitInputs.push('shop');
  const emptyLoadout=kit.items?.length?false:kit.shop??true;
  const parts={location:hash([card,picture,choices.spawns.map(entry=>entry.id),scale]),kit:hash(kitInputs),arrival:hash([destination,kit.title,kit.title_key,emptyLoadout,scale]),intro:hash([intro??null,scale])};
  return {key:JSON.stringify([spawnId,kitId,poolIndex]),spawnId,kitId,poolIndex,spawn,kit,arrival,parts,fingerprint:hash(parts)};
}
function count(choices,filter=''){
  let total=0;for(const spawn of choices.spawns)if(!filter||spawn.id===filter)total+=choices.kits.filter(kit=>!spawn.kits||spawn.kits.includes(kit.id)).length*(spawn.type==='pool'?spawn.pool.length:1);return total;
}
function page(choices,images,{filter='',offset=0,limit=25}={}){
  const result=[];let index=0;
  for(const spawn of choices.spawns){if(filter&&spawn.id!==filter)continue;for(const kit of choices.kits){if(spawn.kits&&!spawn.kits.includes(kit.id))continue;for(let pool=0;pool<(spawn.type==='pool'?spawn.pool.length:1);pool++){if(index++<offset)continue;result.push(scene(choices,images,spawn.id,kit.id,spawn.type==='pool'?pool:null));if(result.length>=limit)return result;}}}return result;
}
class Ledger {
  constructor(raw=null){
    const value=raw===null?{version:1,packs:{}}:typeof raw==='string'?JSON.parse(raw):raw;
    if(value.version!==1||!value.packs||typeof value.packs!=='object'||Array.isArray(value.packs))throw new Error('Saved preview coverage is invalid.');
    for(const records of Object.values(value.packs)){
      if(!records||typeof records!=='object'||Array.isArray(records))throw new Error('Saved preview coverage is invalid.');
      for(const [key,record] of Object.entries(records)){const route=JSON.parse(key);if(!Array.isArray(route)||route.length!==3||typeof route[0]!=='string'||typeof route[1]!=='string'||route[2]!==null&&!Number.isInteger(route[2])||!record?.parts||typeof record.parts!=='object'||Array.isArray(record.parts))throw new Error('Saved preview coverage is invalid.');}
    }
    this.value=JSON.parse(JSON.stringify(value));
  }
  record(pack,route,visited,settings,now=Date.now()){
    if(!Object.hasOwn(this.value.packs,pack))Object.defineProperty(this.value.packs,pack,{value:{},enumerable:true,writable:true,configurable:true});
    const records=this.value.packs[pack],previous=records[route.key],parts={};for(const [key,value] of Object.entries(route.parts))if(visited.includes(key)||previous?.parts[key]===value)parts[key]=value;
    const complete=Object.keys(route.parts).every(key=>parts[key]===route.parts[key]);records[route.key]={parts,testedAt:complete?now:previous?.testedAt??null,updatedAt:now,settings:{...settings}};return complete;
  }
  status(pack,route){const record=this.value.packs[pack]?.[route.key];return {record,state:record?Object.entries(route.parts).every(([key,value])=>record.parts[key]===value)?'tested':record.testedAt?'changed':'partial':'untested'};}
  summary(pack,choices,images){
    let tested=0,changed=0,partial=0;for(const key of Object.keys(this.value.packs[pack]??{})){const [spawn,kit,pool]=JSON.parse(key),route=scene(choices,images,spawn,kit,pool);if(!route)continue;const status=this.status(pack,route).state;if(status==='tested')tested++;else if(status==='changed')changed++;else if(status==='partial')partial++;}
    return {total:count(choices),tested,changed,partial};
  }
  serialize(){return JSON.parse(JSON.stringify(this.value));}
}
const api={hash,pictures,scene,count,page,Ledger};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageCoverage=api;
})();
