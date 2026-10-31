(() => {
'use strict';
const K=HeritageKit,E=HeritageEquipment,count=entry=>entry.item.count??1;
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function identity(entry) {
  const next=K.copy(entry);for(const key of ['inventory','slot','index','cosmetic','ignore_stack_limit'])delete next[key];
  delete next.item.count;next.item.id=K.normalize(next.item.id);
  if(!Object.keys(next.item.components??{}).length)delete next.item.components;
  return JSON.stringify(canonical(next));
}
const compatible=(a,b)=>identity(a)===identity(b);
const amount=(entry,n)=>{const next=K.copy(entry);next.item.count=n;return next;};
function cursor(value) {
  if(!value)return null;
  if(!E.valid(value.origin)||!value.entry)throw new Error('Invalid held stack.');
  E.putEntry({title:'Held stack',items:[]},value.origin,value.entry);
  return K.copy(value);
}
function result(document,held){return {document,cursor:held};}
function click(document,held,slot,button=0) {
  E.address(slot);const existing=E.entryAt(document,slot);
  if(!held){
    if(!existing)return result(document,null);
    const taken=button===1?Math.ceil(count(existing)/2):count(existing),remaining=count(existing)-taken;
    const next=remaining?E.putEntry(document,slot,amount(existing,remaining)):E.removeSlot(document,slot);
    return result(next,{entry:amount(existing,taken),origin:slot});
  }
  const entry=held.entry,quantity=count(entry);
  if(!existing){
    const placed=button===1?1:quantity;
    return result(E.putEntry(document,slot,amount(entry,placed)),quantity>placed?{...held,entry:amount(entry,quantity-placed)}:null);
  }
  if(compatible(entry,existing)){
    const placed=Math.min(button===1?1:quantity,K.maxCount(existing)-count(existing));
    if(!placed)return result(document,held);
    return result(E.putEntry(document,slot,amount(existing,count(existing)+placed)),quantity>placed?{...held,entry:amount(entry,quantity-placed)}:null);
  }
  return result(E.putEntry(document,slot,entry),{entry:K.copy(existing),origin:slot});
}
function distribute(document,held,slots,button=0) {
  if(!held)return result(document,null);
  const destinations=[...new Set(slots)].filter(slot=>{
    const existing=E.entryAt(document,slot);
    return !existing||compatible(existing,held.entry)&&count(existing)<K.maxCount(existing);
  }).slice(0,count(held.entry));
  if(!destinations.length)return result(document,held);
  const share=button===1?1:Math.floor(count(held.entry)/destinations.length);
  let next=document,remaining=count(held.entry);
  for(const slot of destinations){
    const existing=E.entryAt(next,slot),before=existing?count(existing):0,taken=Math.min(share,K.maxCount(existing??held.entry)-before,remaining);
    if(taken){next=E.putEntry(next,slot,amount(existing??held.entry,before+taken));remaining-=taken;}
  }
  return result(next,remaining?{...held,entry:amount(held.entry,remaining)}:null);
}
function collect(document,held) {
  if(!held)return result(document,null);
  let next=document,total=count(held.entry),maximum=K.maxCount(held.entry);
  for(const entry of document.items){
    if(!compatible(entry,held.entry)||total>=maximum)continue;
    const taken=Math.min(count(entry),maximum-total),slot=E.id(entry);
    next=taken===count(entry)?E.removeSlot(next,slot):E.putEntry(next,slot,amount(entry,count(entry)-taken));total+=taken;
  }
  const collected={...held,entry:amount(held.entry,total)};
  if(total>count(held.entry))delete collected.source;
  return result(next,collected);
}
function insert(document,entry,slots) {
  let next=document,remaining=count(entry);
  for(const empty of [false,true])for(const slot of slots){
    if(!remaining)break;
    const existing=E.entryAt(next,slot);
    if(empty?!!existing:!existing||!compatible(existing,entry))continue;
    const before=existing?count(existing):0,taken=Math.min(remaining,K.maxCount(existing??entry)-before);
    if(taken){next=E.putEntry(next,slot,amount(existing??entry,before+taken));remaining-=taken;}
  }
  return {document:next,remaining};
}
function quickMove(document,slot) {
  const entry=E.entryAt(document,slot);if(!entry)return result(document,null);
  const address=E.address(slot),data=K.items.get(K.normalize(entry.item.id)),armor={head:39,chest:38,legs:37,feet:36}[data?.armor];
  let destinations=Array.from({length:36},(_,i)=>i);
  if(address.inventory==='player'&&address.index<36){
    destinations=address.index<9?Array.from({length:27},(_,i)=>i+9):Array.from({length:9},(_,i)=>i);
    if(armor!==undefined&&!E.entryAt(document,armor))destinations.unshift(armor);
  }
  const moved=insert(E.removeSlot(document,slot),entry,destinations.filter(value=>value!==slot));
  return result(moved.remaining?E.putEntry(moved.document,slot,amount(entry,moved.remaining)):moved.document,null);
}
function returnCursor(document,held) {
  if(!held||held.source==='library')return result(document,null);
  let state=result(document,held),existing=E.entryAt(document,held.origin);
  if(!existing||compatible(existing,held.entry))state=click(document,held,held.origin);
  if(!state.cursor)return state;
  const moved=insert(state.document,state.cursor.entry,Array.from({length:36},(_,i)=>i));
  return result(moved.document,moved.remaining?{...state.cursor,entry:amount(state.cursor.entry,moved.remaining)}:null);
}
function drag(document,held,from,slots,button=0) {
  const started=held?result(document,held):click(document,null,from,button),targets=[...new Set(slots)].filter(slot=>held||slot!==from);
  if(!targets.length)return result(document,held);
  if(targets.length===1&&button===0)return click(started.document,started.cursor,targets[0]);
  return distribute(started.document,started.cursor,targets,button);
}
function fromLibrary(document,held,id,slot,{shift=false,button=0,fill=false}={}) {
  E.address(slot);const item={id:K.normalize(id)},maximum=K.maxCount(item);
  if(shift){
    if(E.entryAt(document,slot))return result(document,held);
    const limit=typeof slot==='number'&&slot>=36&&slot<=39?Math.min(1,maximum):maximum;
    item.count=button===1?1:limit;
    return result(E.putEntry(document,slot,{index:0,item}),held);
  }
  if(held)throw new Error('Place the held stack or cancel its pickup before choosing another item.');
  item.count=fill?maximum:1;
  return result(document,cursor({entry:{index:0,item},origin:slot,source:'library'}));
}
function confirmDelete(entry,draft=null) {
  if(entry&&(!K.items.has(K.normalize(entry.item.id))||Object.keys(entry.item.components??{}).length>0))return true;
  if(!draft)return false;
  if(draft.id?.trim()&&!K.items.has(K.normalize(draft.id.trim())))return true;
  try{return JSON.stringify(canonical(JSON.parse(draft.components)))!==JSON.stringify(canonical(entry?.item.components??{}));}catch(failure){return true;}
}
const api={click,distribute,collect,quickMove,returnCursor,drag,confirmDelete,cursor,compatible,fromLibrary};
globalThis.HeritageKitMouse=api;
if(typeof module!=='undefined')module.exports=api;
})();
