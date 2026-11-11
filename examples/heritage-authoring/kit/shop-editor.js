(() => {
'use strict';
const K=HeritageKit,PAGE_SIZE=24,MAX_OFFERS=256,DEFAULT_BUDGET=12;
const pageOf=index=>Math.floor(index/PAGE_SIZE);
function paginate(offers,page) {
  const count=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
  const index=Math.max(0,Math.min(page,count-1)),start=index*PAGE_SIZE;
  return {index,count,start,offers:offers.slice(start,start+PAGE_SIZE)};
}
function edit(kit,action) {
  const next=K.copy(kit);
  if(action.type==='add'){
    next.shop??={budget:DEFAULT_BUDGET,offers:[]};
    if(next.shop.offers.length>=MAX_OFFERS)throw new Error('A shop can have up to '+MAX_OFFERS+' offers.');
    next.shop.offers.push({cost:1,item:{id:K.normalize(action.id.trim())}});
    return next;
  }
  const shop=next.shop;
  if(!shop)throw new Error('Add an offer to start a shop.');
  if(action.type==='budget'){shop.budget=action.value;return next;}
  const offer=shop.offers[action.index];
  if(!offer)throw new Error('That offer is no longer available.');
  switch(action.type){
    case 'count': offer.item.count=action.value; break;
    case 'cost': offer.cost=action.value; break;
    case 'limit': offer.limit=action.value; break;
    case 'move':
      if(shop.offers[action.to])[shop.offers[action.index],shop.offers[action.to]]=[shop.offers[action.to],offer];
      break;
    case 'remove':
      shop.offers.splice(action.index,1);
      if(!shop.offers.length)delete next.shop;
      break;
    default: throw new Error('Unknown shop edit.');
  }
  return next;
}
function create(config) {
  const $=id=>document.getElementById(id),V=HeritageInventory,T=HeritageItemText;
  const budget=$('shop-budget'),form=$('shop-add-form'),itemId=$('shop-item-id'),list=$('shop-offers'),tray=$('shop-tray'),status=$('shop-status');
  const addButton=form.querySelector('button'),previous=$('shop-prev'),next=$('shop-next');
  const narrow=matchMedia('(max-width:550px)'),preview=$('shop-preview');
  const fitPreview=()=>{preview.open=!narrow.matches;};
  fitPreview();narrow.addEventListener('change',fitPreview);
  let page=0,selection=-1,rows=[],cells=[],locked=false;
  function report(message='',error=false){
    status.textContent=message;status.hidden=!message;status.dataset.error=String(error);
  }
  function label(tag,className,text){
    const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;
  }
  function button(text,action){
    const node=label('button','',text);node.type='button';node.addEventListener('click',action);return node;
  }
  function iconFor(node,stack){
    const id=stack.id,data=K.items.get(K.normalize(id));
    if(node.dataset.item===id&&node.itemData===data)return;
    node.dataset.item=id;node.itemData=data;node.replaceChildren(V.icon(id));
  }
  function highlight(index){
    selection=index;
    for(const row of rows)row.element.dataset.selected=String(row.index===index);
    for(const cell of cells)if(cell.button)cell.button.setAttribute('aria-pressed',String(cell.index===index));
  }
  function focusRow(index,control){
    const row=rows.find(entry=>entry.index===index);
    if(!row){itemId.focus();return;}
    const target=row[control];
    (target.disabled?row.count:target).focus();
  }
  function apply(action,focus=undefined,message=''){
    if(locked)return false;
    const beforePage=page,beforeSelection=selection;
    try{
      const candidate=edit(config.getKit(),action);
      K.read(JSON.stringify(candidate));
      if(action.type==='add')selection=candidate.shop.offers.length-1;
      if(action.type==='move')selection=action.to;
      if(action.type==='remove')selection=Math.min(action.index,(candidate.shop?.offers.length??0)-1);
      if(selection>=0)page=pageOf(selection);
      if(!config.commit(candidate))throw new Error('The shop edit could not be saved. Check the kit for pending edits.');
    }catch(error){
      page=beforePage;selection=beforeSelection;render();report(error.message,true);return false;
    }
    render();report(message);
    if(focus)focusRow(selection,focus);
    return true;
  }
  function number(input,action){
    if(!input.validity.valid||!Number.isInteger(input.valueAsNumber)){
      report('Enter a whole number from '+input.min+' to '+input.max+'.',true);render();return;
    }
    apply({...action,value:input.valueAsNumber});
  }
  function makeRow(){
    const element=label('li','shop-offer'),identity=label('div','shop-offer-item');
    const icon=label('span','shop-offer-icon'),name=label('span','shop-offer-name'),position=label('span','shop-offer-number');
    identity.append(position,icon,name);
    const fields=label('div','shop-offer-fields'),actions=label('div','shop-offer-actions');
    const row={element,icon,name,position};
    for(const [field,title,min,max] of [['count','Count',1,99],['cost','Price',0,1000000],['limit','Limit',1,41]]){
      const fieldLabel=label('label','',title),input=label('input');
      input.type='number';input.min=min;input.max=max;input.step='1';input.required=true;
      input.addEventListener('change',()=>number(input,{type:field,index:row.index}));
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}});
      fieldLabel.append(input);fields.append(fieldLabel);row[field]=input;
    }
    row.up=button('Earlier',()=>apply({type:'move',index:row.index,to:row.index-1},'up'));
    row.down=button('Later',()=>apply({type:'move',index:row.index,to:row.index+1},'down'));
    row.remove=button('Remove',()=>apply({type:'remove',index:row.index},'remove'));
    actions.append(row.up,row.down,row.remove);
    element.append(identity,fields,actions);
    element.addEventListener('focusin',()=>highlight(row.index));
    list.append(element);
    return row;
  }
  function makeCell(){
    const element=label('div','shop-cell');
    tray.append(element);
    return {element};
  }
  function fillCell(cell,offer,index){
    cell.index=index;
    if(!offer){
      if(cell.button)cell.element.replaceChildren();
      cell.button=null;
      return;
    }
    if(!cell.button){
      cell.button=button('',()=>{highlight(cell.index);focusRow(cell.index,'count');});
      cell.button.className='shop-cell';
      cell.icon=label('span','');
      cell.cost=label('span','shop-cell-cost');
      cell.count=label('span','shop-cell-count');
      cell.button.append(cell.icon,cell.cost,cell.count);cell.element.append(cell.button);
    }
    const count=offer.item.count??1;
    iconFor(cell.icon,offer.item);
    cell.cost.textContent=String(offer.cost);cell.count.textContent=count>1?String(count):'';
    cell.button.setAttribute('aria-label','Edit offer '+(index+1)+': '+count+' × '+T.name(offer.item)+' for '+offer.cost+' points');
  }
  function render(){
    const kit=config.getKit(),shop=kit.shop,reason=config.lockedReason();
    locked=!!reason;
    const offers=reason&&reason.invalid?[]:shop?.offers??[];
    const view=paginate(offers,page);page=view.index;
    if(selection>=offers.length)selection=offers.length-1;
    budget.value=Number.isInteger(shop?.budget)?shop.budget:'';
    budget.disabled=locked||!offers.length;
    itemId.disabled=locked;
    addButton.disabled=locked||offers.length>=MAX_OFFERS;
    $('shop-count').textContent=offers.length?offers.length+' offer'+(offers.length===1?'':'s'):reason?.invalid?'':'Fixed kit';
    $('shop-empty').hidden=!!offers.length&&!reason;
    $('shop-empty').textContent=reason?.message??'Pick an item from the browser or enter an ID to start a shop.';
    $('shop-pages').hidden=!offers.length;
    $('shop-page').textContent='Page '+(page+1)+' of '+view.count+' · Offers '+(view.start+1)+'–'+(view.start+view.offers.length);
    previous.disabled=page===0;next.disabled=page+1===view.count;
    while(rows.length>view.offers.length)rows.pop().element.remove();
    while(rows.length<view.offers.length)rows.push(makeRow());
    for(const [offset,offer] of view.offers.entries()){
      const row=rows[offset],index=view.start+offset,name=T.name(offer.item);
      row.index=index;row.position.textContent=String(index+1);
      iconFor(row.icon,offer.item);row.name.textContent=name;row.name.title=offer.item.id;
      row.count.value=offer.item.count??1;row.count.max=K.maxCount(offer.item);
      row.cost.value=offer.cost;row.limit.value=offer.limit??1;
      for(const [field,text] of [['count','Stack size'],['cost','Price in points'],['limit','Purchase limit']]){
        row[field].disabled=locked;row[field].setAttribute('aria-label',text+' for offer '+(index+1)+', '+name);
      }
      row.up.disabled=locked||index===0;row.down.disabled=locked||index+1===offers.length;row.remove.disabled=locked;
      for(const [action,text] of [['up','Move earlier'],['down','Move later'],['remove','Remove']])row[action].setAttribute('aria-label',text+' offer '+(index+1)+', '+name);
    }
    while(cells.length<PAGE_SIZE)cells.push(makeCell());
    for(const [offset,cell] of cells.entries())fillCell(cell,view.offers[offset],view.start+offset);
    highlight(selection);
  }
  function add(id){
    const name=K.items.get(K.normalize(id.trim()))?.name??id.trim();
    return apply({type:'add',id},undefined,name+' added.');
  }
  budget.addEventListener('change',()=>number(budget,{type:'budget'}));
  budget.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();budget.blur();}});
  form.addEventListener('submit',event=>{event.preventDefault();if(add(itemId.value)){itemId.value='';itemId.focus();}});
  previous.addEventListener('click',()=>{page--;render();});
  next.addEventListener('click',()=>{page++;render();});
  return {add,render,reset(){page=0;selection=-1;itemId.value='';report();render();}};
}
globalThis.HeritageShopEditor={create,edit,paginate};
if(typeof module!=='undefined')module.exports=globalThis.HeritageShopEditor;
})();
