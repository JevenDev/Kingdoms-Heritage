(() => {
'use strict';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const idPattern=/^(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$/;
const normalize=id=>id.includes(':')?id:'minecraft:'+id;
const items=new Map(HeritageItems.items.map(item=>[item.id,item]));
const integer=(value,min,max,name)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(name+' must be a whole number from '+min+' to '+max+'.');};
function read(source) {
  let document;
  try {document=JSON.parse(source);}catch(error){throw new Error('Invalid JSON: '+error.message);}
  if(!object(document))throw new Error('A kit must be a JSON object.');
  if(document.enabled!==undefined&&typeof document.enabled!=='boolean')throw new Error('enabled must be true or false.');
  if(document.enabled===false)return {document,warnings:[]};
  for(const name of ['title','title_key','description','description_key','order','selected_slot','tags','items'])if(document[name]===null)throw new Error(name+' cannot be null.');
  const title=document.title??document.title_key;
  if(typeof title!=='string'||!title.trim()||title.length>120)throw new Error('Enter a title or title_key from 1 to 120 characters.');
  for(const [name,max] of [['description',4000],['title_key',256],['description_key',256]])if(document[name]!==undefined&&(typeof document[name]!=='string'||document[name].length>max))throw new Error(name+' must be text up to '+max+' characters.');
  integer(document.order??0,-2147483648,2147483647,'order');
  integer(document.selected_slot??0,0,8,'selected_slot');
  if(document.tags!==undefined&&(!Array.isArray(document.tags)||document.tags.length>128||document.tags.some(tag=>typeof tag!=='string'||!idPattern.test(tag))))throw new Error('tags must contain up to 128 resource IDs, without #.');
  if(!Array.isArray(document.items)||document.items.length>256)throw new Error('items must be an array of up to 256 entries.');
  const occupied=new Set(),warnings=[];
  for(const [n,entry] of document.items.entries()) {
    const label='Item '+(n+1);
    if(!object(entry))throw new Error(label+' must be an object.');
    for(const name of ['inventory','slot','cosmetic','index'])if(entry[name]===null)throw new Error(label+': '+name+' cannot be null.');
    const inventory=entry.inventory??'player',slot=entry.slot??'',cosmetic=entry.cosmetic??false;
    if(!['player','curios','accessories'].includes(inventory))throw new Error(label+': unknown inventory.');
    integer(entry.index,0,inventory==='player'?40:255,label+' slot index');
    if(typeof slot!=='string'||typeof cosmetic!=='boolean'||(inventory==='player'&&(slot!==''||cosmetic))||(inventory!=='player'&&(!slot.trim()||slot.length>128)))throw new Error(label+': invalid equipment slot.');
    const key=[inventory,slot,entry.index,cosmetic].join('/');
    if(occupied.has(key))throw new Error('Two items use the same slot: '+key);
    occupied.add(key);
    if(!object(entry.item)||typeof entry.item.id!=='string'||!idPattern.test(entry.item.id))throw new Error(label+': enter a valid item ID.');
    const id=normalize(entry.item.id),known=items.get(id);
    if(id.startsWith('minecraft:')&&!known)throw new Error(label+': unknown Minecraft 1.21.1 item '+id);
    if(entry.item.components!==undefined&&!object(entry.item.components))throw new Error(label+': components must be a JSON object.');
    if(entry.item.count===null)throw new Error(label+': count cannot be null.');
    const componentMax=entry.item.components?.['minecraft:max_stack_size'];
    const maximum=componentMax===undefined?known?.max??99:componentMax;
    integer(maximum,1,99,label+' maximum stack size');
    integer(entry.item.count??1,1,maximum,label+' count');
    if(!known)warnings.push(id+' needs its mod installed. Its model and components must be checked in Minecraft.');
  }
  return {document,warnings:[...new Set(warnings)]};
}
const copy=value=>JSON.parse(JSON.stringify(value));
function setSlot(document,index,item) {
  integer(index,0,40,'Player slot index');
  const result=copy(document);if(!Array.isArray(result.items))result.items=[];
  const existing=result.items.find(entry=>(entry.inventory??'player')==='player'&&entry.index===index);
  if(existing)existing.item=copy(item);else result.items.push({index,item:copy(item)});
  read(JSON.stringify(result));return result;
}
function removeSlot(document,index) {
  integer(index,0,40,'Player slot index');
  const result=copy(document);result.items=(Array.isArray(result.items)?result.items:[]).filter(entry=>(entry.inventory??'player')!=='player'||entry.index!==index);return result;
}
function moveSlot(document,from,to) {
  integer(from,0,40,'Source slot');integer(to,0,40,'Destination slot index');
  const result=copy(document);if(!Array.isArray(result.items))return result;
  const entry=result.items.find(entry=>(entry.inventory??'player')==='player'&&entry.index===from);
  if(!entry||from===to)return result;
  const other=result.items.find(entry=>(entry.inventory??'player')==='player'&&entry.index===to);
  entry.index=to;if(other)other.index=from;
  read(JSON.stringify(result));return result;
}
const itemAt=(document,index)=>(Array.isArray(document.items)?document.items:[]).find(entry=>entry&&(entry.inventory??'player')==='player'&&entry.index===index)?.item;
const maxCount=stack=>stack.components?.['minecraft:max_stack_size']??items.get(normalize(stack.id))?.max??99;
function firstEmpty(document) {
  const occupied=new Set((Array.isArray(document.items)?document.items:[]).filter(entry=>entry&&(entry.inventory??'player')==='player').map(entry=>entry.index));
  return Array.from({length:36},(_,i)=>i).find(index=>!occupied.has(index));
}
function placeItem(document,index,id,{count,fill=false}={}) {
  const previous=itemAt(document,index),same=previous&&normalize(previous.id)===normalize(id);
  const stack=same?copy(previous):{id:normalize(id)},maximum=maxCount(stack);
  stack.count=fill?maximum:Math.min(maximum,count??(same?previous.count??1:1));
  return setSlot(document,index,stack);
}
function neighbor(index,key) {
  if(index>=36) {
    const armor=[39,38,37,36],row=armor.indexOf(index);
    if(index===40)return key==='ArrowLeft'?36:key==='ArrowUp'?38:key==='ArrowDown'?12:index;
    if(key==='ArrowUp')return armor[Math.max(0,row-1)];
    if(key==='ArrowDown')return row===3?9:armor[row+1];
    return key==='ArrowRight'?40:index;
  }
  const row=index<9?3:Math.floor((index-9)/9),column=index<9?index:(index-9)%9;
  if(key==='ArrowLeft')return column?index-1:row<2?36:40;
  if(key==='ArrowRight')return column<8?index+1:index;
  if(key==='ArrowUp')return row===0?(column===0?36:40):row===3?27+column:index-9;
  if(key==='ArrowDown')return row===3?index:row===2?column:index+9;
  return index;
}
const slotName=index=>index<9?'Hotbar '+(index+1):index<36?'Inventory '+(index-8):({36:'Boots',37:'Leggings',38:'Chestplate',39:'Helmet',40:'Offhand'})[index];
const positions=Array.from({length:41},(_,index)=>({index,x:index<9?8+index*18:index<36?8+(index-9)%9*18:index===40?77:8,y:index<9?142:index<36?84+Math.floor((index-9)/9)*18:index===40?62:8+(39-index)*18}));
globalThis.HeritageKit={read,copy,setSlot,removeSlot,moveSlot,slotName,positions,items,normalize,itemAt,maxCount,firstEmpty,placeItem,neighbor};
if(typeof module!=='undefined')module.exports=globalThis.HeritageKit;
})();
