(() => {
'use strict';
const K=typeof module==='undefined'?HeritageKit:(require('../kit/catalog.js'),require('../kit/engine.js'));
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
  const selection=settings?JSON.parse(settings.content):bundled.selection;
  const result={...Object.fromEntries(Object.entries(entries).map(([kind,values])=>[kind,[...values.values()].sort(compare)])),guiScale:selection?.gui_scale??0,kitPreview:selection?.kit_preview??'inventory'};
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
function companionNames(names){
  if(names.length<3)return names.join(' and ');
  return names.slice(0,-1).join(', ')+', and '+names.at(-1);
}
function context(spawn,kit,player,names,translations={},companions=[]) {
  let placeName=(names.structure!=='Wilderness'?names.structure:names.biome).replace(/^Village .+$/,'Village').replace(/^Ruined Portal.*$/,'Ruined Portal').replace(/^Ocean Ruin .+$/,'Ocean Ruins').toLowerCase();
  if(!/^(the |a |an )/.test(placeName))placeName='the '+placeName;
  return {...names,player,party_leader:player,party_size:String(companions.length+1),companions:companionNames(companions),spawn:label(spawn,'title',translations),kit:label(kit,'title',translations),equipment:kit.items?.length?label(kit,'title',translations):'nothing but your own two hands',place:placeName,
    facts:{kit:kit.id??'',spawn:spawn.id??'',dimension:spawn.dimension??'minecraft:overworld',biome:spawn.type==='biome'&&!spawn.target?.startsWith('#')?spawn.target:'minecraft:plains',structure:spawn.type==='structure'&&!spawn.target?.startsWith('#')?spawn.target:'',inventory_policy:'merge',keeps_belongings:'false',receives_kit:String(!!kit.items?.length)}};
}
function narration(player,names,kit,translations={}) {
  let location=names.structure!=='Wilderness'?names.structure:names.biome;
  location=location.replace(/^Village .+$/,'Village').replace(/^Ruined Portal.*$/,'Ruined Portal').replace(/^Ocean Ruin .+$/,'Ocean Ruins').toLowerCase();
  const segment=(prefix,value,suffix,pause)=>({text:prefix+value+suffix,pause,highlight:[Array.from(prefix).length,Array.from(value).length]});
  const placeName=(/^(the |a |an )/.test(location)?'':'the ')+location;
  const equipment=kit.items?.length?segment(' with equipment from the "',label(kit,'title',translations),'" kit...',1000):segment(' with ','nothing but your own two hands','...',1000);
  const party=names.companions?[segment(' You will arrive with ',names.companions,'...',1000)]:[];
  return [segment('',player,'...',500),segment(' you woke up in ',placeName,'...',1000),equipment,...party,{text:' is that correct?',pause:0}];
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
const pageSize=10;
function browseLocation(count,index,offset,byPage=false){
  const last=count-1;
  if(byPage){
    const page=Math.floor(index/pageSize),next=Math.max(0,Math.min(Math.floor(last/pageSize),page+offset));
    index=next*pageSize+index%pageSize;
  }else index+=offset;
  return Math.max(0,Math.min(last,index));
}
const shopColumns=4,shopRows=8,shopPageSize=shopColumns*shopRows;
function shopOfferIndices(shop,section=''){
  const indices=[];
  for(const [index,offer] of shop.offers.entries())if(!section||offer.section===section)indices.push(index);
  return indices;
}
function shopLayout(shop,section=''){
  const positioned=new Map(),automatic=[];
  for(const index of shopOfferIndices(shop,section)){
    const offer=shop.offers[index],position=(offer.section??'')===section?offer.position:null;
    if(!position){automatic.push(index);continue;}
    if(!positioned.has(position.column))positioned.set(position.column,Array(shopRows).fill(-1));
    positioned.get(position.column)[position.row-1]=index;
  }
  const explicit=[...positioned.keys()].sort((a,b)=>a-b).map(column=>positioned.get(column));
  const autoColumns=Math.max(Math.min(shopColumns,automatic.length),Math.ceil(automatic.length/shopRows));
  const columns=explicit.length+autoColumns;
  return {
    columns,
    pages:Math.max(1,columns-shopColumns+1),
    window(offset){
      return Array.from({length:shopPageSize},(_,cell)=>{
        const row=Math.floor(cell/shopColumns),column=offset+cell%shopColumns;
        if(column>=columns)return -1;
        return column<explicit.length?explicit[column][row]:automatic[row*autoColumns+column-explicit.length]??-1;
      });
    }
  };
}
function equipmentSlot(stack){
  const id=stack.id.includes(':')?stack.id:'minecraft:'+stack.id;
  if(id==='minecraft:shield')return 40;
  if(/^minecraft:(?:(?:leather|chainmail|iron|golden|diamond|netherite|turtle)_helmet|(?:skeleton|wither_skeleton)_skull|(?:player|zombie|creeper|dragon|piglin)_head|carved_pumpkin)$/.test(id))return 39;
  if(/^minecraft:(?:(?:leather|chainmail|iron|golden|diamond|netherite)_chestplate|elytra)$/.test(id))return 38;
  if(/^minecraft:(?:leather|chainmail|iron|golden|diamond|netherite)_leggings$/.test(id))return 37;
  if(/^minecraft:(?:leather|chainmail|iron|golden|diamond|netherite)_boots$/.test(id))return 36;
  return -1;
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const stackRoom=(current,offered)=>current&&K.normalize(current.id)===K.normalize(offered.id)
  &&JSON.stringify(canonical(current.components??{}))===JSON.stringify(canonical(offered.components??{}))
  ?Math.max(0,K.maxCount(current)-(current.count??1)):0;
function placePurchase(items,slot,stack){
  const target=items.get(slot);
  if(slot>=36)return target?null:new Map(items).set(slot,{index:slot,item:stack});
  if(target&&!stackRoom(target.item,stack))return null;
  let remaining=stack.count??1;
  const next=new Map(items);
  const fill=index=>{
    const entry=next.get(index),count=Math.min(remaining,stackRoom(entry?.item,stack));
    if(!count)return;
    next.set(index,{...entry,item:{...entry.item,count:(entry.item.count??1)+count}});
    remaining-=count;
  };
  fill(slot);
  for(let i=0;i<36&&remaining;i++)if(i!==slot)fill(i);
  if(!remaining)return next;
  let empty=target?0:slot;
  while(empty<36&&next.has(empty))empty++;
  if(empty===36)return null;
  next.set(empty,{index:empty,item:remaining===(stack.count??1)?stack:{...stack,count:remaining}});
  return next;
}
function purchaseSlot(items,stack){
  const equipment=equipmentSlot(stack);
  let matching=-1,empty=-1,count=stack.count??1;
  for(let i=0;i<36;i++){
    if(!items.has(i)&&empty<0)empty=i;
    const room=stackRoom(items.get(i)?.item,stack);
    if(room&&matching<0)matching=i;
    count-=room;
  }
  return matching>=0&&(count<=0||empty>=0)?matching:equipment>=0&&!items.has(equipment)?equipment:empty;
}
class Session {
  constructor(choices,{shopOnly=false}={}){
    this.choices=structuredClone(choices);this.shopOnly=shopOnly;this.restart();
  }
  restart(){
    this.phase=this.shopOnly?'kit-shop':'location';this.kit=this.shopOnly?this.choices.kits[0]:null;
    this.spawn=null;this.arrival=null;this.kitIndex=0;this.poolIndex=null;this.purchases=[];
  }
  snapshot(){
    const result={phase:this.phase,spawnId:this.spawn?.id??'',kitId:this.kit?.id??'',poolIndex:this.spawn?.type==='pool'?this.poolIndex:null};
    if(this.kit?.shop&&this.purchases.length)result.purchases=this.purchases.map(pick=>({...pick}));
    return result;
  }
  resume(value){
    this.restart();if(!value||!this.choices.spawns.some(entry=>entry.id===value.spawnId))return false;
    this.choose(value.spawnId);const allowed=this.allowed();if(!allowed.length){this.restart();return false;}
    this.kitIndex=Math.max(0,allowed.findIndex(entry=>entry.id===value.kitId));this.kit=allowed[this.kitIndex];
    const phases=['location-confirm','kit','kit-confirm','kit-shop','loading','review','intro'];this.phase=phases.includes(value.phase)?value.phase:'location-confirm';
    if(this.phase==='kit-shop'&&!this.kit.shop)this.phase='kit';
    if(this.phase==='kit-confirm'&&this.kit.shop)this.phase='kit-shop';
    if(['kit','kit-confirm'].includes(this.phase)&&allowed.length===1&&!this.kit.shop)this.phase='location-confirm';
    if(this.kit.shop&&this.kit.id===value.kitId&&Array.isArray(value.purchases)){
      for(const pick of value.purchases){
        const {offer,slot}=pick??{},status=this.shopStatus(offer);
        if(!status||status.issue||!Number.isInteger(slot)||slot<0||slot>=36&&slot!==equipmentSlot(status.offer.item))continue;
        if(placePurchase(this.shopItems(),slot,status.offer.item))this.purchases=[...this.purchases,{offer,slot}];
      }
    }
    const arriving=['loading','review','intro'].includes(this.phase);this.poolIndex=this.spawn.type==='pool'&&Number.isInteger(value.poolIndex)&&this.spawn.pool[value.poolIndex]?value.poolIndex:arriving?0:null;
    this.arrival=arriving?destination(this.spawn,this.poolIndex??0):null;if(this.phase==='intro'&&!this.arrival.intro)this.phase='review';return true;
  }
  allowed(){return this.choices.kits.filter(kit=>!this.spawn?.kits||this.spawn.kits.includes(kit.id));}
  choose(id){
    if(this.phase!=='location')return;
    const spawn=this.choices.spawns.find(entry=>entry.id===id);
    if(!spawn)throw new Error('Choose an available location.');
    this.spawn=spawn;this.phase='location-confirm';this.kitIndex=0;this.kit=this.allowed()[0];this.purchases=[];
  }
  select(index){
    if(this.phase!=='kit')return;
    const kit=this.allowed()[index];if(!kit||kit===this.kit)return;
    this.kitIndex=index;this.kit=kit;this.purchases=[];
  }
  loadout(){
    if(!this.purchases.length)return this.kit;
    const items=new Map(this.shopItems());
    const fixed=(this.kit.items??[]).map(entry=>{
      if((entry.inventory??'player')!=='player')return entry;
      const current=items.get(entry.index);
      items.delete(entry.index);
      return current;
    });
    return {...this.kit,items:[...fixed,...items.values()]};
  }
  shopItems(picks=this.purchases){
    if(this.shopItemsCache?.picks===picks&&this.shopItemsCache.kit===this.kit)return this.shopItemsCache.items;
    let items=new Map((this.kit.items??[]).filter(entry=>(entry.inventory??'player')==='player').map(entry=>[entry.index,entry]));
    for(const {offer,slot} of picks){
      items=placePurchase(items,slot,this.kit.shop.offers[offer].item);
      if(!items)return null;
    }
    this.shopItemsCache={kit:this.kit,picks,items};
    return items;
  }
  get spent(){return this.purchases.reduce((total,pick)=>total+this.kit.shop.offers[pick.offer].cost,0);}
  shopStatus(index){
    const offer=Number.isInteger(index)?this.kit?.shop?.offers[index]:null;if(!offer)return null;
    const bought=this.purchases.filter(pick=>pick.offer===index).length,limit=offer.limit??1;
    const remaining=this.kit.shop.budget-this.spent-offer.cost;
    const slot=purchaseSlot(this.shopItems(),offer.item);
    const issue=bought>=limit?'limit_reached':remaining===-1?'short_one':remaining<0?'short':slot<0||this.purchases.length>=41?'no_space':'';
    return {offer,bought,limit,remaining,slot,issue};
  }
  buy(index){
    if(this.phase!=='kit-shop')return false;
    const status=this.shopStatus(index);
    if(!status||status.issue)return false;
    this.purchases=[...this.purchases,{offer:index,slot:status.slot}];return true;
  }
  refund(slot){
    if(this.phase!=='kit-shop')return false;
    const index=this.purchases.findLastIndex(pick=>pick.slot===slot);
    if(index<0)return false;
    let requested=this.purchases.filter((_,i)=>i!==index);
    if(!this.shopItems(requested)){
      const placed=[];
      let items=this.shopItems([]);
      for(const {offer} of requested){
        const stack=this.kit.shop.offers[offer].item,slot=purchaseSlot(items,stack);
        if(slot<0)return false;
        items=placePurchase(items,slot,stack);
        placed.push({offer,slot});
      }
      requested=placed;
    }
    this.purchases=requested;return true;
  }
  resetShop(){if(this.phase==='kit-shop')this.purchases=[];}
  next(poolIndex=0){
    if(this.shopOnly)return;
    if(this.phase==='location-confirm'){
      if(!this.kit)throw new Error('This location has no allowed kits.');
      if(this.allowed().length>1||this.kit.shop){this.phase='kit';return;}
      this.prepareArrival(poolIndex);
    }else if(this.phase==='kit')this.phase=this.kit.shop?'kit-shop':'kit-confirm';
    else if(['kit-confirm','kit-shop'].includes(this.phase))this.prepareArrival(poolIndex);
    else if(this.phase==='loading')this.phase='review';
    else if(this.phase==='review')this.phase=this.arrival.intro?'intro':'complete';
    else if(this.phase==='intro')this.phase='complete';
  }
  prepareArrival(index){
    this.arrival=destination(this.spawn,index);
    this.poolIndex=this.spawn.type==='pool'?index:null;
    this.phase='loading';
  }
  back(){
    if(this.shopOnly)return;
    if(this.phase==='location-confirm'){this.phase='location';return;}
    if(this.phase==='kit'){this.phase='location-confirm';return;}
    if(['kit-confirm','kit-shop'].includes(this.phase)){this.phase='kit';return;}
    if(this.phase==='review')this.phase=this.kit.shop?'kit-shop':this.allowed().length===1?'location-confirm':'kit';
  }
}
const api={pageSize,shopColumns,shopPageSize,shopOfferIndices,shopLayout,browseLocation,companionNames,compare,catalog,label,place,destination,locations,context,narration,revealed,Session};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageFlow=api;
})();
