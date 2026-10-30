(() => {
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value));
const keys={kits:'heritage.kitCreator.v1',intros:'heritage.introEditor.v1',packs:'heritage.packAssembler.projects.v1'};
function validatePack(value) {
  if(value?.version!==1||typeof value.name!=='string'||typeof value.namespace!=='string'||typeof value.description!=='string'||!Array.isArray(value.kits)||!Array.isArray(value.locations)||value.kits.some(entry=>!entry||typeof entry.id!=='string'||typeof entry.path!=='string')||value.locations.some(entry=>!entry||typeof entry.id!=='string'||!entry.fields||!Array.isArray(entry.kits)||!Array.isArray(entry.destinations)))throw new Error('Unsupported pack project.');
  const result=copy(value);
  if(new Set(result.locations.map(entry=>entry.id)).size!==result.locations.length||new Set(result.kits.map(entry=>entry.id)).size!==result.kits.length)throw new Error('Duplicate project entries.');
  if(!result.locations.some(entry=>entry.id===result.active))result.active=result.locations[0]?.id??'';
  return result;
}
function library(value,kind) {
  if(value===null)return {version:2,active:'', [kind]:[]};
  if(typeof value?.source==='string')value={version:2,active:'legacy',[kind]:[{id:'legacy',state:value}]};
  if(value?.version!==2||!Array.isArray(value[kind]))throw new Error('Unsupported '+kind+' library.');
  const ids=new Set();
  for(const entry of value[kind]) {
    if(!entry||typeof entry.id!=='string'||ids.has(entry.id)||typeof entry.state?.source!=='string'||!entry.state.document||typeof entry.state.document!=='object'||Array.isArray(entry.state.document))throw new Error('Invalid '+kind+' draft.');
    ids.add(entry.id);
  }
  if(value[kind].length&&!ids.has(value.active))throw new Error('Missing active '+kind+' draft.');
  return copy(value);
}
function backup(pack,kits,intros) {
  return {format:'heritage-project',version:1,pack:validatePack(pack),kits:library(kits,'kits'),intros:library(intros,'intros')};
}
function merge(input,current,createId=()=>crypto.randomUUID()) {
  if(input?.format!=='heritage-project'||input.version!==1)throw new Error('Choose a Heritage project JSON saved with Save project.');
  const result=backup(input.pack,input.kits,input.intros),maps={};
  for(const kind of ['kits','intros']) {
    const existing=library(current[kind],kind),incoming=result[kind],map=new Map();
    for(const entry of incoming[kind]) {
      const match=existing[kind].find(saved=>saved.id===entry.id);
      let id=entry.id;
      if(match&&JSON.stringify(match.state)!==JSON.stringify(entry.state)) {
        do{id=createId();}while(existing[kind].some(saved=>saved.id===id));
      }
      map.set(entry.id,id);
      if(!existing[kind].some(saved=>saved.id===id))existing[kind].push({...entry,id});
    }
    if(!existing.active)existing.active=map.get(incoming.active)??existing[kind][0]?.id??'';
    result[kind]=existing;maps[kind]=map;
  }
  for(const kit of result.pack.kits)kit.id=maps.kits.get(kit.id)??kit.id;
  for(const location of result.pack.locations) {
    location.intro=maps.intros.get(location.intro)??location.intro;
    for(const destination of location.destinations)if(typeof destination.intro==='string')destination.intro=maps.intros.get(destination.intro)??destination.intro;
    location.kits=location.kits.map(id=>maps.kits.get(id)??id);
  }
  return result;
}
function write(storage,values) {
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,storage.getItem(key)]));
  try{for(const [key,value] of Object.entries(values))storage.setItem(key,JSON.stringify(value));}
  catch(error) {
    try{for(const [key,value] of Object.entries(previous))if(value===null)storage.removeItem(key);else storage.setItem(key,value);}
    catch(rollback){throw new Error('Saving failed and restoring browser storage also failed. Keep your project backup. '+rollback.message);}
    throw new Error('Could not save the project. Previous data was restored. '+error.message);
  }
}
class Projects {
  constructor(storage,initial,createId=()=>crypto.randomUUID()) {
    this.storage=storage;this.createId=createId;
    const raw=storage.getItem(keys.packs);
    if(raw) {
      const value=JSON.parse(raw);
      if(value?.version!==1||!Array.isArray(value.projects)||!value.projects.length)throw new Error('Unsupported saved packs.');
      this.projects=value.projects.map(entry=>({id:entry.id,state:validatePack(entry.state)}));
      if(this.projects.some(entry=>typeof entry.id!=='string')||new Set(this.projects.map(entry=>entry.id)).size!==this.projects.length)throw new Error('Invalid saved pack IDs.');
      if(!this.projects.some(entry=>entry.id===value.active))throw new Error('The active pack is missing.');
      this.active=value.active;
    } else {
      const legacy=storage.getItem('heritage.packAssembler.v1');
      this.active=createId();this.projects=[{id:this.active,state:legacy?validatePack(JSON.parse(legacy)):initial}];
      const pack=this.projects[0].state;
      if(!legacy&&pack.namespace==='my_heritage')pack.namespace='heritage_'+this.active.replaceAll('-','');
    }
  }
  state(){return copy(this.projects.find(entry=>entry.id===this.active).state);}
  update(state){this.projects.find(entry=>entry.id===this.active).state=copy(state);}
  add(state){this.active=this.createId();this.projects.push({id:this.active,state:copy(state)});}
  serialize(){return {version:1,active:this.active,projects:copy(this.projects)};}
  save(){write(this.storage,{[keys.packs]:this.serialize()});}
}
const api={keys,validatePack,library,backup,merge,write,Projects};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageProject=api;
})();
