(() => {
'use strict';
const compareText=(a,b)=>a<b?-1:a>b?1:0;
const compare=(a,b)=>{
  const [an,ap]=a.id.split(':'),[bn,bp]=b.id.split(':');
  return (a.order??0)-(b.order??0)||compareText(ap,bp)||compareText(an,bn);
};
function catalog(output,bundled) {
  if(output.errors.length)throw new Error('Fix the pack errors before previewing.');
  const entries={spawns:new Map(),kits:new Map()};
  for(const kind of Object.keys(entries))for(const entry of bundled[kind])entries[kind].set(entry.id,structuredClone(entry));
  for(const file of output.files) {
    const match=/^data\/([^/]+)\/heritage\/(spawns|kits)\/(.+)\.json$/.exec(file.path);
    if(!match)continue;
    const [,namespace,kind,name]=match,document=JSON.parse(file.content),id=namespace+':'+name;
    if(document.enabled===false)entries[kind].delete(id);
    else entries[kind].set(id,{...document,id});
  }
  const settings=output.files.find(file=>file.path==='data/kingdomsheritage/heritage/selection.json');
  const result={...Object.fromEntries(Object.entries(entries).map(([kind,values])=>[kind,[...values.values()].sort(compare)])),guiScale:settings?JSON.parse(settings.content).gui_scale??0:bundled.selection?.gui_scale??0};
  for(const spawn of result.spawns){const selectors=spawn.kits;spawn.kits=result.kits.filter(kit=>!selectors?.length||selectors.includes(kit.id)||(kit.tags??[]).some(tag=>selectors.includes('#'+tag))).map(kit=>kit.id);}
  return result;
}
const label=(entry,field,translations={})=>Object.hasOwn(translations,entry[field+'_key'])?translations[entry[field+'_key']]:entry[field]??entry[field+'_key']??'';
const place=value=>String(value||'').replace(/^#?[^:]+:/,'').split(/[/_]+/).filter(Boolean).map(word=>word[0].toUpperCase()+word.slice(1)).join(' ');
function destination(spawn,index=0) {
  if(spawn.type!=='pool')return structuredClone(spawn);
  if(!Number.isInteger(index)||!spawn.pool[index])throw new Error('Choose an available pool destination.');
  const result={...structuredClone(spawn),...structuredClone(spawn.pool[index])};
  delete result.pool;
  return result;
}
function locations(spawn,sample={}) {
  const names={biome:sample.biome||'Plains',structure:sample.structure||'Wilderness',dimension:place(spawn.dimension||'minecraft:overworld')};
  if(['biome','structure'].includes(spawn.type)&&!spawn.target?.startsWith('#'))names[spawn.type]=place(spawn.target);
  return names;
}
function context(spawn,kit,player,names,translations={}) {
  let placeName=(names.structure!=='Wilderness'?names.structure:names.biome).replace(/^Village .+$/,'Village').replace(/^Ruined Portal.*$/,'Ruined Portal').replace(/^Ocean Ruin .+$/,'Ocean Ruins').toLowerCase();
  if(!/^(the |a |an )/.test(placeName))placeName='the '+placeName;
  return {...names,player,party_leader:player,party_size:'1',companions:'',spawn:label(spawn,'title',translations),kit:label(kit,'title',translations),equipment:kit.items?.length?label(kit,'title',translations):'nothing but your own two hands',place:placeName,
    facts:{kit:kit.id??'',spawn:spawn.id??'',dimension:spawn.dimension??'minecraft:overworld',biome:spawn.type==='biome'&&!spawn.target?.startsWith('#')?spawn.target:'minecraft:plains',structure:spawn.type==='structure'&&!spawn.target?.startsWith('#')?spawn.target:'',inventory_policy:'merge',keeps_belongings:'false',receives_kit:String(!!kit.items?.length)}};
}
function narration(player,names,kit,translations={}) {
  let location=names.structure!=='Wilderness'?names.structure:names.biome;
  location=location.replace(/^Village .+$/,'Village').replace(/^Ruined Portal.*$/,'Ruined Portal').replace(/^Ocean Ruin .+$/,'Ocean Ruins').toLowerCase();
  const segment=(prefix,value,suffix,pause)=>({text:prefix+value+suffix,pause,highlight:[Array.from(prefix).length,Array.from(value).length]});
  const placeName=(/^(the |a |an )/.test(location)?'':'the ')+location;
  const equipment=kit.items.length?segment(' with equipment from the "',label(kit,'title',translations),'" kit...',1000):segment(' with ','nothing but your own two hands','...',1000);
  return [segment('',player,'...',500),segment(' you woke up in ',placeName,'...',1000),equipment,{text:' is that correct?',pause:0}];
}
function revealed(segments,elapsed) {
  let count=0;
  for(const segment of segments) {
    const length=Array.from(segment.text).length,duration=length*40;
    if(elapsed<duration)return count+Math.min(length,Math.floor(Math.max(0,elapsed)/40));
    count+=length;elapsed-=duration;
    if(elapsed<segment.pause)return count;
    elapsed-=segment.pause;
  }
  return count;
}
class Session {
  constructor(choices){this.choices=structuredClone(choices);this.restart();}
  restart(){this.phase='location';this.spawn=null;this.kit=null;this.arrival=null;this.kitIndex=0;this.poolIndex=null;}
  snapshot(){return {phase:this.phase,spawnId:this.spawn?.id??'',kitId:this.kit?.id??'',poolIndex:this.spawn?.type==='pool'?this.poolIndex:null};}
  resume(value){
    this.restart();if(!value||!this.choices.spawns.some(entry=>entry.id===value.spawnId))return false;
    this.choose(value.spawnId);const allowed=this.allowed();if(!allowed.length){this.restart();return false;}
    this.kitIndex=Math.max(0,allowed.findIndex(entry=>entry.id===value.kitId));this.kit=allowed[this.kitIndex];
    const phases=['location-confirm','kit','kit-confirm','loading','review','intro'];this.phase=phases.includes(value.phase)?value.phase:'location-confirm';
    if(['kit','kit-confirm'].includes(this.phase)&&allowed.length===1)this.phase='location-confirm';
    const arriving=['loading','review','intro'].includes(this.phase);this.poolIndex=this.spawn.type==='pool'&&Number.isInteger(value.poolIndex)&&this.spawn.pool[value.poolIndex]?value.poolIndex:arriving?0:null;
    this.arrival=arriving?destination(this.spawn,this.poolIndex??0):null;if(this.phase==='intro'&&!this.arrival.intro)this.phase='review';return true;
  }
  allowed(){return this.choices.kits.filter(kit=>!this.spawn?.kits||this.spawn.kits.includes(kit.id));}
  choose(id){
    if(this.phase!=='location')return;
    const spawn=this.choices.spawns.find(entry=>entry.id===id);
    if(!spawn)throw new Error('Choose an available location.');
    this.spawn=spawn;this.phase='location-confirm';this.kitIndex=0;this.kit=this.allowed()[0];
  }
  select(index){
    if(this.phase!=='kit')return;
    const kit=this.allowed()[index];if(!kit)return;
    this.kitIndex=index;this.kit=kit;
  }
  next(poolIndex=0){
    if(this.phase==='location-confirm'){
      if(!this.kit)throw new Error('This location has no allowed kits.');
      this.phase=this.allowed().length===1?'loading':'kit';
    }else if(this.phase==='kit')this.phase='kit-confirm';
    else if(this.phase==='kit-confirm')this.phase='loading';
    else if(this.phase==='loading')this.phase='review';
    else if(this.phase==='review')this.phase=this.arrival.intro?'intro':'complete';
    else if(this.phase==='intro')this.phase='complete';
    if(this.phase==='loading'){this.poolIndex=poolIndex;this.arrival=destination(this.spawn,poolIndex);}
  }
  back(){
    if(this.phase==='location-confirm'){this.phase='location';return;}
    if(this.phase==='kit'){this.phase='location-confirm';return;}
    if(this.phase==='kit-confirm'){this.phase='kit';return;}
    if(this.phase==='review')this.phase=this.allowed().length===1?'location-confirm':'kit';
  }
}
const api={compare,catalog,label,place,destination,locations,context,narration,revealed,Session};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageFlow=api;
})();
