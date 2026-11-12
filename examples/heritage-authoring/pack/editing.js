(() => {
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const kinds=['kits','intros'];
const bundledKits=state=>(typeof module!=='undefined'?require('./engine.js'):HeritagePack).bundledKits(state);
const empty=kind=>({version:2,active:'',[kind]:[]});
const library=(value,kind)=>copy(value??empty(kind));
const draft=(value,kind,id)=>value?.[kind]?.find(entry=>entry.id===id)?.state??null;
const packContent=pack=>{const {active,...result}=pack;return result;};
const actionSizes=new WeakMap();
function actionSize(action){
  if(!actionSizes.has(action))actionSizes.set(action,JSON.stringify(action).length);
  return actionSizes.get(action);
}
function workspace(pack,libraries){return {pack:copy(pack),libraries:Object.fromEntries(kinds.map(kind=>[kind,library(libraries[kind],kind)]))};}
function applyDrafts(libraries,changes,direction){
  const result=Object.fromEntries(kinds.map(kind=>[kind,library(libraries[kind],kind)]));
  for(const change of changes){
    const {kind,id}=change,current=draft(result[kind],kind,id),expected=change[direction<0?'after':'before'],next=change[direction<0?'before':'after'];
    if(!equal(current,expected))throw new Error('A shared '+(kind==='kits'?'kit':'intro')+' changed outside this history. Keep that version before restoring this change.');
    const entries=result[kind][kind],index=entries.findIndex(entry=>entry.id===id);
    if(next===null){if(index>=0)entries.splice(index,1);}
    else if(index>=0)entries[index]={...entries[index],state:copy(next)};
    else entries.push({id,state:copy(next)});
    if(!entries.some(entry=>entry.id===result[kind].active))result[kind].active=entries[0]?.id??'';
  }
  return result;
}
class History {
  constructor(pack,libraries){this.present=workspace(pack,libraries);this.actions=[];this.index=0;}
  observe(libraries){this.present.libraries=workspace(this.present.pack,libraries).libraries;}
  record(pack,libraries,{drafts=[],group='',label='Edit pack',now=Date.now()}={}){
    const next=workspace(pack,libraries),changes=[];
    for(const {kind,id} of drafts){
      if(!kinds.includes(kind)||changes.some(change=>change.kind===kind&&change.id===id))continue;
      const before=draft(this.present.libraries[kind],kind,id),after=draft(next.libraries[kind],kind,id);
      if(!equal(before,after))changes.push({kind,id,before:copy(before),after:copy(after)});
    }
    if(equal(packContent(this.present.pack),packContent(next.pack))&&!changes.length){this.present=next;return false;}
    this.actions.splice(this.index);
    const previous=this.actions.at(-1),combine=group&&previous?.group===group&&now-previous.time<700;
    if(combine){
      previous.after=next.pack;previous.time=now;actionSizes.delete(previous);
      for(const change of changes){const existing=previous.drafts.find(entry=>entry.kind===change.kind&&entry.id===change.id);if(existing)existing.after=change.after;else previous.drafts.push(change);}
    }else this.actions.push({before:this.present.pack,after:next.pack,drafts:changes,group,label,time:now});
    this.present=next;this.index=this.actions.length;
    let bytes=this.actions.reduce((total,action)=>total+actionSize(action),0);
    while(this.actions.length>1&&(this.actions.length>50||bytes>16*1024*1024)){bytes-=actionSize(this.actions.shift());this.index--;}
    return true;
  }
  plan(direction,pack,libraries){
    const action=this.actions[direction<0?this.index-1:this.index];if(!action)return null;
    if(!equal(packContent(pack),packContent(direction<0?action.after:action.before)))throw new Error('The pack changed outside this history. Reload it before restoring a change.');
    return {pack:copy(direction<0?action.before:action.after),libraries:applyDrafts(libraries,action.drafts,direction)};
  }
  accept(direction,value){this.index+=direction;this.present=workspace(value.pack,value.libraries);}
  get canUndo(){return this.index>0;}
  get canRedo(){return this.index<this.actions.length;}
}
function assign(pack,ids,{kitIds,intro}={}){
  const result=copy(pack),targets=result.locations.filter(entry=>ids.includes(entry.id));
  if(!targets.length||targets.length!==new Set(ids).size)throw new Error('Choose available locations.');
  if(kitIds){
    if(!kitIds.length)throw new Error('Choose at least one kit.');
    const stock=new Set(bundledKits(result).map(entry=>entry.id));
    for(const id of kitIds){if(stock.has(id))continue;const kit=result.kits.find(kit=>kit.id===id);if(!kit)throw new Error('This kit is unavailable.');kit.included=true;}
    for(const entry of targets){entry.kitMode='selected';entry.kits=[...new Set(kitIds)];}
  }
  if(intro!==undefined)for(const entry of targets)entry.intro=intro;
  return result;
}
function reorder(pack,ids,spawns=null){
  if(ids.length!==pack.locations.length||new Set(ids).size!==ids.length||ids.some(id=>!pack.locations.some(entry=>entry.id===id)))throw new Error('Choose each location once when reordering.');
  if(pack.keepLocations&&(spawns?.length||pack.bundledLocations)){
    const custom=new Map(pack.locations.map(entry=>[pack.namespace+':'+entry.path,entry])),text=(a,b)=>a<b?-1:a>b?1:0;
    const locations=(spawns?.length?[...spawns]:[...Object.entries(pack.bundledLocations).filter(([id])=>!custom.has(id)).map(([id,document])=>({...copy(document),id})),...pack.locations.map(entry=>({id:pack.namespace+':'+entry.path,order:Number(entry.fields.order)||0}))]).sort((a,b)=>(a.order??0)-(b.order??0)||text(a.id.split(':')[1],b.id.split(':')[1])||text(a.id.split(':')[0],b.id.split(':')[0]));
    const queue=ids.map(id=>pack.locations.find(entry=>entry.id===id)).map(entry=>pack.namespace+':'+entry.path);
    return reorderCards(pack,locations.map(spawn=>custom.has(spawn.id)?queue.shift():spawn.id),locations);
  }
  const result=copy(pack);ids.forEach((id,index)=>{result.locations.find(entry=>entry.id===id).fields.order=String(index);});return result;
}
function reorderCards(pack,ids,spawns=[]){
  const custom=new Map(pack.locations.map(entry=>[pack.namespace+':'+entry.path,entry.id])),defaults=pack.keepLocations?['default','random','plains','village'].map(id=>'kingdomsheritage:'+id).filter(id=>!custom.has(id)):[],available=[...custom.keys(),...defaults];
  if(!Array.isArray(ids)||ids.length!==available.length||new Set(ids).size!==ids.length||ids.some(id=>!available.includes(id)))throw new Error('Choose each starting location once when reordering.');
  const result=copy(pack);if(defaults.length)result.bundledLocations={};
  ids.forEach((id,index)=>{if(custom.has(id))result.locations.find(entry=>entry.id===custom.get(id)).fields.order=String(index);else{const source=spawns.find(spawn=>spawn.id===id);if(!source)throw new Error('Default locations are still loading. Try again.');const document=copy(source);delete document.id;document.order=index;result.bundledLocations[id]=document;}});
  return result;
}
function reorderKits(pack,ids){
  const available=[...pack.kits.map(entry=>entry.id),...bundledKits(pack).map(entry=>entry.id)];
  if(ids.length!==available.length||new Set(ids).size!==ids.length||ids.some(id=>!available.includes(id)))throw new Error('Choose each kit once when reordering.');
  const result=copy(pack);result.kitOrder=[...ids];return result;
}
function duplicateDraft(pack,libraries,kind,id,locationId,newId,destination=null){
  const collection=kind==='kit'?'kits':kind==='intro'?'intros':null;if(!collection)throw new Error('Unknown draft kind.');
  const value=workspace(pack,libraries),entries=value.libraries[collection][collection],source=entries.find(entry=>entry.id===id),location=value.pack.locations.find(entry=>entry.id===locationId);
  const stock=kind==='kit'?bundledKits(pack).find(entry=>entry.id===id)?.document:null;
  if(!location||!source&&!stock&&(kind!=='kit'||id!=='builtin-empty'))throw new Error('Choose an available draft and location.');
  if(entries.some(entry=>entry.id===newId))throw new Error('The new draft ID is already in use.');
  const document=stock??{title:'Empty-handed',items:[]};
  const cloned=source?copy(source):{state:{source:JSON.stringify(document),document:copy(document)}};cloned.id=newId;
  if(collection==='kits'){
    const document=JSON.parse(cloned.state.source);document.title=(document.title||document.title_key||'Kit')+' copy';delete document.title_key;cloned.state.source=JSON.stringify(document,null,2);cloned.state.document=copy(document);cloned.state.validDocument=copy(document);cloned.state.drafts=[];cloned.state.cursor=null;cloned.state.error=null;
    const base=document.title.toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'kit_copy';let path=base,index=2;while(value.pack.kits.some(entry=>entry.path===path))path=base+'_'+index++;
    value.pack.kits.push({id:newId,path,included:true});if(location.kitMode==='selected')location.kits.push(newId);
    if(value.pack.kitOrder){const order=value.pack.kitOrder,at=order.indexOf(id);order.splice(at<0?order.length:at+1,0,newId);}
  }else{
    cloned.state.name=(cloned.state.name||'Intro')+' copy';
    if(Number.isInteger(destination)){if(!location.destinations[destination])throw new Error('This place is unavailable.');location.destinations[destination].intro=newId;}else location.intro=newId;
  }
  entries.push(cloned);value.libraries[collection].active=newId;return value;
}
function privateCopy(pack,libraries,kind,id,locationId,newId){
  const collection=kind==='kit'?'kits':kind==='intro'?'intros':null;if(!collection)throw new Error('Unknown draft kind.');
  const value=workspace(pack,libraries),source=value.libraries[collection][collection].find(entry=>entry.id===id),location=value.pack.locations.find(entry=>entry.id===locationId);
  if(!source||!location)throw new Error('Choose an available draft and location.');
  if(value.libraries[collection][collection].some(entry=>entry.id===newId))throw new Error('The new draft ID is already in use.');
  const cloned=copy(source);cloned.id=newId;if(collection==='intros')cloned.state.name=(cloned.state.name||'Intro')+' copy';
  value.libraries[collection][collection].push(cloned);value.libraries[collection].active=newId;
  if(collection==='kits'){
    const original=value.pack.kits.find(entry=>entry.id===id);if(!original)throw new Error('This kit is not in the pack.');
    const available=location.kitMode==='selected'?location.kits:[...value.pack.kits.filter(entry=>entry.included).map(entry=>entry.id),...bundledKits(value.pack).map(entry=>entry.id)];
    const base=original.path+'_copy';let path=base,index=2;while(value.pack.kits.some(entry=>entry.path===path))path=base+'_'+index++;
    if(value.pack.kitOrder){const order=value.pack.kitOrder,at=order.indexOf(id);order.splice(at<0?order.length:at+1,0,newId);}
    value.pack.kits.push({id:newId,path,included:true});location.kitMode='selected';location.kits=[...new Set(available.map(value=>value===id?newId:value))];if(!location.kits.includes(newId))location.kits.push(newId);
  }else{
    let replaced=false;if(location.intro===id){location.intro=newId;replaced=true;}
    for(const destination of location.destinations)if(destination.intro===id){destination.intro=newId;replaced=true;}
    if(!replaced)location.intro=newId;
  }
  return value;
}
function checkpoint(pack,libraries,name,id,created=Date.now()){
  if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw new Error('Name the checkpoint using 1 to 80 characters.');
  const value=workspace(pack,libraries),ids={kits:new Set(pack.kits.filter(entry=>entry.included).map(entry=>entry.id)),intros:new Set()};
  for(const location of pack.locations){for(const id of location.kits)ids.kits.add(id);if(location.intro)ids.intros.add(location.intro);for(const destination of location.destinations)if(typeof destination.intro==='string'&&destination.intro)ids.intros.add(destination.intro);}
  for(const kind of kinds){value.libraries[kind][kind]=value.libraries[kind][kind].filter(entry=>ids[kind].has(entry.id));value.libraries[kind].active=value.libraries[kind][kind][0]?.id??'';}
  return {id,name:name.trim(),created,...value};
}
function restoreCheckpoint(saved,pack,libraries){
  const result=workspace(saved.pack,libraries),drafts=[];
  for(const kind of kinds)for(const entry of saved.libraries[kind][kind]){
    const entries=result.libraries[kind][kind],index=entries.findIndex(value=>value.id===entry.id);
    if(index>=0)entries[index]=copy(entry);else entries.push(copy(entry));
    if(!result.libraries[kind].active)result.libraries[kind].active=entry.id;
    drafts.push({kind,id:entry.id});
  }
  return {...result,drafts};
}
const api={History,workspace,assign,reorder,reorderCards,reorderKits,duplicateDraft,privateCopy,checkpoint,restoreCheckpoint};
if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageEditing=api;
})();
