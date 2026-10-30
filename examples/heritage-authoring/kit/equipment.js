(() => {
'use strict';
const K=HeritageKit,D=HeritageEquipmentData,inventoryNames=['player','curios','accessories'];
function address(value) {
  if(Number.isInteger(value)&&value>=0&&value<=40)return {inventory:'player',slot:'',index:value,cosmetic:false};
  if(typeof value==='string'){
    let parsed;try{parsed=JSON.parse(value);}catch(failure){throw new Error('Invalid equipment destination.');}
    if(Array.isArray(parsed)&&parsed.length===4&&['curios','accessories'].includes(parsed[0])&&typeof parsed[1]==='string'&&parsed[1].trim()&&parsed[1].length<=128&&Number.isInteger(parsed[2])&&parsed[2]>=0&&parsed[2]<=255&&typeof parsed[3]==='boolean')return {inventory:parsed[0],slot:parsed[1],index:parsed[2],cosmetic:parsed[3]};
  }
  throw new Error('Invalid equipment destination.');
}
function id(entry) {
  const inventory=entry.inventory??'player';
  if(inventory==='player'){address(entry.index);return entry.index;}
  const key=JSON.stringify([inventory,entry.slot,entry.index,entry.cosmetic??false]);address(key);return key;
}
function valid(value){try{address(value);return true;}catch(failure){return false;}}
function name(value) {
  const slot=address(value);if(slot.inventory==='player')return K.slotName(slot.index);
  return (slot.inventory==='curios'?'Curios ':'Accessories ')+(slot.cosmetic?'cosmetic ':'')+slot.slot+' '+(slot.index+1);
}
function entryAt(document,value) {return (Array.isArray(document.items)?document.items:[]).find(entry=>entry&&id(entry)===value);}
function setSlot(document,value,item) {
  if(typeof value==='number')return K.setSlot(document,value,item);
  const result=K.copy(document),destination=address(value),entry=entryAt(result,value);
  result.items??=[];
  if(entry)entry.item=K.copy(item);else result.items.push({...destination,item:K.copy(item)});
  K.read(JSON.stringify(result));return result;
}
function removeSlots(document,values) {
  const slots=new Set(values);for(const value of slots)address(value);
  const result=K.copy(document);result.items=(result.items||[]).filter(entry=>!slots.has(id(entry)));return result;
}
function removeSlot(document,value) {return removeSlots(document,[value]);}
function destination(entry,value) {
  const target=address(value);entry.index=target.index;
  if(target.inventory==='player'){delete entry.inventory;delete entry.slot;delete entry.cosmetic;}
  else{entry.inventory=target.inventory;entry.slot=target.slot;entry.cosmetic=target.cosmetic;}
}
function putEntry(document,value,entry) {
  const result=removeSlot(document,value),next=K.copy(entry);destination(next,value);result.items.push(next);K.read(JSON.stringify(result));return result;
}
function moveSlot(document,from,to) {
  address(from);address(to);const result=K.copy(document),entry=entryAt(result,from);
  if(!entry||from===to)return result;
  const other=entryAt(result,to);destination(entry,to);if(other)destination(other,from);
  K.read(JSON.stringify(result));return result;
}
function placeItem(document,value,itemId,{fill=false}={}) {
  const previous=entryAt(document,value)?.item,same=previous&&K.normalize(previous.id)===K.normalize(itemId),stack=same?K.copy(previous):{id:K.normalize(itemId)};
  stack.count=fill?K.maxCount(stack):same?previous.count??1:1;
  return setSlot(document,value,stack);
}
function slotMeta(inventory,name) {
  const known=D.slots[inventory].find(slot=>slot.name===name),group=inventory==='accessories'?Object.entries(D.groups).find(([,group])=>group.slots.includes(name))?.[0]||'unsorted':'';
  return {order:known?.order??0,group,icon:known?.icon};
}
function defaults() {
  return Object.fromEntries(['curios','accessories'].map(inventory=>[inventory,D.slots[inventory].map(slot=>({name:slot.name,count:slot.count,order:slot.order,group:slotMeta(inventory,slot.name).group}))]));
}
function validateProfile(value,inventory) {
  if(!['curios','accessories'].includes(inventory)||!Array.isArray(value)||value.length>256)throw new Error('A slot layout can contain up to 256 slot types.');
  const seen=new Set();
  return value.map(slot=>{
    if(!slot||typeof slot.name!=='string'||!slot.name.trim()||slot.name.length>128||seen.has(slot.name))throw new Error('Use a unique slot name from 1 to 128 characters.');
    if(!Number.isInteger(slot.count)||slot.count<0||slot.count>256)throw new Error('Slot counts must be whole numbers from 0 to 256.');
    if(!Number.isInteger(slot.order??0)||(slot.order??0)<-2147483648||(slot.order??0)>2147483647)throw new Error('Slot order must be a whole 32-bit number.');
    if(inventory==='accessories'&&slot.group!==undefined&&(typeof slot.group!=='string'||!slot.group.trim()||slot.group.length>128))throw new Error('Use a group name from 1 to 128 characters.');
    seen.add(slot.name);return {name:slot.name,count:slot.count,order:slot.order??0,group:inventory==='accessories'?slot.group??slotMeta(inventory,slot.name).group:''};
  });
}
function profile(document,profiles,inventory) {
  const result=K.copy(profiles?.[inventory]??defaults()[inventory]),byName=new Map(result.map(slot=>[slot.name,slot]));
  for(const entry of document.enabled===false?[]:document.items||[]){
    if(entry.inventory!==inventory)continue;
    let slot=byName.get(entry.slot);
    if(!slot){slot={name:entry.slot,count:0,...slotMeta(inventory,entry.slot)};byName.set(slot.name,slot);result.push(slot);}
    slot.count=Math.max(slot.count,entry.index+1);
  }
  return result.filter(slot=>slot.count>0).sort((a,b)=>{
    if(inventory==='curios')return a.order-b.order||a.name.localeCompare(b.name);
    const ga=Object.hasOwn(D.groups,a.group)?D.groups[a.group].order:10,gb=Object.hasOwn(D.groups,b.group)?D.groups[b.group].order:10;
    return gb-ga||a.group.localeCompare(b.group)||b.order-a.order||a.name.localeCompare(b.name);
  });
}
function total(slots){return slots.reduce((sum,slot)=>sum+slot.count,0);}
function slice(slots,start,count) {
  const result=[];let offset=0;
  for(const slot of slots){
    const begin=Math.max(0,start-offset),end=Math.min(slot.count,start+count-offset);
    for(let index=begin;index<end;index++)result.push({slot:slot.name,index,group:slot.group,icon:slot.icon??slotMeta('curios',slot.name).icon});
    offset+=slot.count;if(offset>=start+count)break;
  }
  return result;
}
function reveal(document,profiles,value) {
  const target=address(value);if(target.inventory==='player')return 0;
  const slots=profile(document,profiles,target.inventory);let index=target.index;
  for(const slot of slots){if(slot.name===target.slot)break;index+=slot.count;}
  return target.inventory==='curios'?Math.floor(index/48):Math.min(index,Math.max(0,total(slots)-8));
}
function nativeIcon(inventory,slot,cosmetic) {
  if(!D.slots[inventory].some(type=>type.name===slot))return null;
  if(inventory==='curios')return 'curios/slot/empty_'+(cosmetic?'cosmetic':slot)+'_slot.png';
  return 'accessories/gui/slot/'+slot+'.png';
}
function layout(document,{mode='player',profiles,cosmetics=false,offset=0}={}) {
  if(!inventoryNames.includes(mode))throw new Error('Unknown inventory preview.');
  const result={mode,width:176,height:166,inventoryX:0,inventoryY:0,playerX:51,slots:[],blits:[],controls:[],offset:0,maxOffset:0,total:0,first:0,shown:0};
  const blit=(file,x,y,sx=0,sy=0,sw=D.assets[file]?.width??176,sh=D.assets[file]?.height??166,width=sw,height=sh,nine=false)=>result.blits.push({file,x,y,sx,sy,sw,sh,width,height,nine});
  let active=[],types=[];
  if(mode!=='player'){
    types=profile(document,profiles,mode);result.total=total(types);
    result.maxOffset=mode==='curios'?Math.max(0,Math.ceil(result.total/48)-1):Math.max(0,result.total-8);
    result.offset=Math.max(0,Math.min(Number.isInteger(offset)?offset:0,result.maxOffset));
    result.first=mode==='curios'?result.offset*48:result.offset;
    active=slice(types,result.first,mode==='curios'?48:8);result.shown=active.length;
  }
  if(mode==='curios'&&active.length){
    const columns=Math.ceil(active.length/8),panelWidth=14+18*columns,paged=result.maxOffset>0;
    result.inventoryX=panelWidth+1;result.inventoryY=23;result.width+=panelWidth+1;result.height+=23;
    const file='curios/gui/curios/inventory.png',rows=Array.from({length:columns},(_,col)=>Math.ceil((active.length-col)/columns)),top=23,upper=7+rows[0]*18+(paged?8:0);
    blit(file,result.inventoryX-31,0,32,0,28,24);
    let x=0;
    for(let column=0;column<columns;column++){
      const textureX=column?98:91;blit(file,x,top,textureX,0,25,upper);blit(file,x,top+upper,textureX,159,25,7);
      if(columns===1){blit(file,x+7,top,98,0,25,upper);blit(file,x+7,top+upper,98,159,25,7);}
      x+=column?18:25;
    }
    for(let column=0;column<columns;column++)blit(file,7+column*18,top+7+(paged?8:0),7,7,18,rows[column]*18);
    active.forEach((row,n)=>{
      const slot={inventory:'curios',slot:row.slot,index:row.index,cosmetic:cosmetics};
      result.slots.push({...slot,id:id(slot),x:8+(n%columns)*18,y:top+8+(paged?8:0)+Math.floor(n/columns)*18,icon:nativeIcon(mode,row.slot,cosmetics)});
      if(cosmetics)blit(file,7+(n%columns)*18,top+7+(paged?8:0)+Math.floor(n/columns)*18,32,50,18,18);
    });
    const cosmeticFile='curios/gui/curios/cosmetic_'+(cosmetics?'on':'off')+'.png';
    blit(cosmeticFile,result.inventoryX-27,5,0,0,20,17);
    result.controls.push({key:'cosmetics',kind:'cosmetics',label:cosmetics?'Show equipped Curios slots':'Show cosmetic Curios slots',x:result.inventoryX-27,y:5,width:20,height:17});
    if(paged)for(const [direction,x,sx] of [[-1,result.inventoryX-28,32],[1,result.inventoryX-17,43]]){
      const disabled=direction<0?result.offset===0:result.offset===result.maxOffset;
      blit(file,x,top+2,sx,disabled?37:25,11,12);result.controls.push({key:'page'+direction,kind:'page',value:result.offset+direction,disabled,label:direction<0?'Previous Curios slots':'Next Curios slots',x,y:top+2,width:11,height:12});
    }
  }
  if(mode==='accessories'){
    const overflow=result.maxOffset>0,side=(cosmetics?72:52)-(overflow?0:12),x=9,panelHeight=22+active.length*18,panelWidth=44+(cosmetics?20:0)-(overflow?0:12);
    result.inventoryX=side+9;result.width+=side+9;result.playerX=88;
    blit('accessories/gui/sprites/background_patch.png',x+6,0,0,0,15,15,panelWidth,Math.max(22,panelHeight),true);
    if(overflow){
      blit('accessories/gui/sprites/scroll_bar_patch.png',x+13,15,0,0,6,6,8,panelHeight-22,true);
      const nativeHeight=101+Math.floor(Math.min(result.total/20,1)*(31-101)),thumbHeight=nativeHeight+(nativeHeight%2===0?1:0),thumbY=16+(panelHeight-24-thumbHeight)*result.offset/result.maxOffset;
      blit('accessories/gui/sprites/scroll_bar.png',x+14,Math.round(thumbY),0,0,6,6,6,thumbHeight,true);
      result.controls.push({key:'scroll',kind:'scroll',label:'Accessories slot scroll',x:x+13,y:15,width:8,height:panelHeight-22,value:result.offset,max:result.maxOffset});
    }
    active.forEach((row,n)=>{
      for(const cosmetic of cosmetics?[true,false]:[false]){
        const slot={inventory:'accessories',slot:row.slot,index:row.index,cosmetic},sx=result.inventoryX+(cosmetic?-46:-26),sy=16+n*18;
        blit('accessories/gui/theme/light/slot.png',sx-1,sy-1,0,0,18,18);
        result.slots.push({...slot,id:id(slot),x:sx,y:sy,icon:nativeIcon(mode,row.slot,false)});
      }
    });
    const toggleX=result.inventoryX-(cosmetics?47:27),toggleWidth=cosmetics?38:18;
    blit('widget/button.png',toggleX,7,0,0,200,20,toggleWidth,6,true);
    result.controls.push({key:'cosmetics',kind:'cosmetics',label:cosmetics?'Hide cosmetic Accessories slots':'Show cosmetic Accessories slots',x:toggleX,y:7,width:toggleWidth,height:6});
    let groupStart=0,groupY=4;
    const groups=[...new Set(types.map(slot=>slot.group))];
    for(const group of groups){
      const groupSize=total(types.filter(slot=>slot.group===group)),selected=groupStart<=result.first+7&&groupStart+groupSize>result.first;
      const gx=selected?0:2,width=selected?19:17,groupIcon='accessories/gui/group/'+(Object.hasOwn(D.groups,group)&&group!=='unsorted'?group:'unknown')+'.png';
      if(groupY+16>panelHeight-4)break;
      blit('accessories/gui/container/horizontal_tabs_small.png',gx,groupY,0,selected?16:0,width,16);
      blit(groupIcon,gx+5,groupY+4,0,0,8,8);
      result.controls.push({key:'group:'+group,kind:'page',label:group+' accessories slots',value:Math.min(groupStart,result.maxOffset),x:gx,y:groupY,width,height:16});
      groupStart+=groupSize;groupY+=17;
    }
  }
  const inventoryFile=mode==='accessories'?'accessories/gui/container/accessories_inventory.png':'inventory.png';
  blit(inventoryFile,result.inventoryX,result.inventoryY,0,0,176,166);
  for(const position of K.positions)result.slots.push({...position,id:position.index,inventory:'player',x:position.index===40&&mode==='accessories'?result.inventoryX+152:position.x+result.inventoryX,y:position.y+result.inventoryY});
  return result;
}
function neighbor(layout,value,key) {
  if(layout.mode==='player')return K.neighbor(value,key);
  const current=layout.slots.find(slot=>slot.id===value);if(!current)return layout.slots[0]?.id??0;
  const horizontal=key==='ArrowLeft'||key==='ArrowRight',direction=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
  let best=current,score=Infinity;
  for(const slot of layout.slots){
    const along=(horizontal?slot.x-current.x:slot.y-current.y)*direction,across=Math.abs(horizontal?slot.y-current.y:slot.x-current.x);
    if(along<=0)continue;
    const distance=along+across*4;if(distance<score){score=distance;best=slot;}
  }
  return best.id;
}
globalThis.HeritageEquipment={address,id,valid,name,entryAt,setSlot,removeSlot,removeSlots,putEntry,moveSlot,placeItem,defaults,validateProfile,profile,total,reveal,layout,neighbor};
if(typeof module!=='undefined')module.exports=globalThis.HeritageEquipment;
})();
