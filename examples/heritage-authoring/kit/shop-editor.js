(() => {
'use strict';
const K=HeritageKit,PAGE_SIZE=24,MAX_OFFERS=256,DEFAULT_BUDGET=12;
const pageOf=index=>Math.floor(index/PAGE_SIZE);
function paginate(offers,page) {
  const count=Math.max(1,Math.ceil(offers.length/PAGE_SIZE));
  const index=Math.max(0,Math.min(page,count-1)),start=index*PAGE_SIZE;
  return {index,count,start,offers:offers.slice(start,start+PAGE_SIZE)};
}
function budgetHint(budget,cost,limit=1){
  if(cost===0)return null;
  if(cost>budget)return {field:'cost',text:'Price exceeds the '+budget+'-point budget.'};
  const affordable=Math.floor(budget/cost);
  if(affordable<limit)return {field:'limit',text:'Budget covers '+affordable+' of '+limit+' stacks.'};
  return null;
}
function edit(kit,action) {
  const next=K.copy(kit);
  if(action.type==='add'){
    next.shop??={budget:DEFAULT_BUDGET,offers:[]};
    if(next.shop.offers.length>=MAX_OFFERS)throw new Error('A shop can have up to '+MAX_OFFERS+' offers.');
    const offer={cost:1,item:{id:K.normalize(action.id.trim())}};
    if(action.section)offer.section=action.section;
    next.shop.offers.push(offer);
    return next;
  }
  const shop=next.shop;
  if(!shop)throw new Error('Add an offer to start a shop.');
  if(action.type==='budget'){shop.budget=action.value;return next;}
  if(action.type==='add-section'){
    shop.sections??=[];
    let number=1;
    while(shop.sections.some(section=>section.id==='section-'+number))number++;
    shop.sections.push({id:'section-'+number,name:'Section '+number,icon:'minecraft:chest'});
    return next;
  }
  if(['section-name','section-icon','remove-section'].includes(action.type)){
    const index=shop.sections?.findIndex(section=>section.id===action.id)??-1;
    if(index<0)throw new Error('That section is no longer available.');
    const section=shop.sections[index];
    if(action.type==='section-name')section.name=action.value.trim();
    else if(action.type==='section-icon')section.icon=K.normalize(action.value.trim());
    else{
      shop.sections.splice(index,1);
      if(!shop.sections.length)delete shop.sections;
      for(const offer of shop.offers)if(offer.section===action.id)delete offer.section;
    }
    return next;
  }
  const offer=shop.offers[action.index];
  if(!offer)throw new Error('That offer is no longer available.');
  switch(action.type){
    case 'count': offer.item.count=action.value; break;
    case 'cost': offer.cost=action.value; break;
    case 'limit': offer.limit=action.value; break;
    case 'section':
      if(action.value)offer.section=action.value;else delete offer.section;
      break;
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
  const addButton=form.querySelector('button'),testShop=$('shop-test'),previous=$('shop-prev'),next=$('shop-next');
  const sectionsPanel=$('shop-sections'),sectionList=$('shop-section-list'),addSection=$('shop-add-section');
  const narrow=matchMedia('(max-width:550px)'),preview=$('shop-preview');
  const fitPreview=()=>{preview.open=!narrow.matches;};
  fitPreview();narrow.addEventListener('change',fitPreview);
  const inlineTabs=$('shop-inline-tabs'),meter=$('shop-preview-bar');
  let page=0,selection=-1,activeSection='',rows=[],cells=[],sectionRows=[],tabs=[],locked=false;
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
      if(['add','move','remove'].includes(action.type)){
        const indices=candidate.shop?HeritageFlow.shopOfferIndices(candidate.shop,activeSection):[];
        if(action.type==='remove')selection=indices.find(index=>index>=action.index)??indices.at(-1)??-1;
        const position=indices.indexOf(selection);
        if(position>=0)page=pageOf(position);
      }
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
  function renderSections(sections,visible){
    sectionsPanel.hidden=!visible;
    addSection.disabled=locked||sections.length>=MAX_OFFERS;
    while(sectionRows.length>sections.length)sectionRows.pop().element.remove();
    while(sectionRows.length<sections.length){
      const element=label('li','shop-section-row'),row={element};
      for(const [field,title,max] of [['name','Tooltip name',120],['icon','Icon item ID',undefined]]){
        const fieldLabel=label('label','stack',title),input=label('input');
        input.required=true;
        if(max)input.maxLength=max;
        if(field==='icon'){input.spellcheck=false;input.autocomplete='off';}
        input.addEventListener('change',()=>apply({type:'section-'+field,id:row.id,value:input.value}));
        fieldLabel.append(input);element.append(fieldLabel);row[field]=input;
      }
      row.remove=button('Remove',()=>{
        const index=sectionRows.indexOf(row);
        if(apply({type:'remove-section',id:row.id}))(sectionRows[index]?.name??addSection).focus();
      });
      element.append(row.remove);sectionList.append(element);sectionRows.push(row);
    }
    for(const [index,section] of sections.entries()){
      const row=sectionRows[index];
      row.id=section.id;
      row.name.value=section.name;row.name.disabled=locked;
      row.icon.value=section.icon;row.icon.disabled=locked;
      row.name.setAttribute('aria-label','Tooltip name for section '+(index+1));
      row.icon.setAttribute('aria-label','Icon item ID for section '+(index+1));
      row.remove.disabled=locked;
      row.remove.setAttribute('aria-label','Remove section '+section.name);
    }
  }
  function renderInlineTabs(sections){
    const entries=sections.length?[{id:'',name:'All offers',icon:'minecraft:chest'},...sections]:[];
    inlineTabs.hidden=!entries.length;
    while(tabs.length>entries.length)tabs.pop().button.remove();
    while(tabs.length<entries.length){
      const tab={icon:label('span','shop-inline-tab-icon')};
      tab.button=button('',()=>{
        if(tab.id===activeSection)return;
        activeSection=tab.id;page=0;selection=-1;render();
      });
      tab.button.className='shop-inline-tab';
      tab.button.append(tab.icon);inlineTabs.append(tab.button);tabs.push(tab);
    }
    for(const [index,section] of entries.entries()){
      const tab=tabs[index];
      tab.id=section.id;
      tab.button.title=section.name;tab.button.setAttribute('aria-label',section.name);
      tab.button.setAttribute('aria-pressed',String(activeSection===section.id));
      iconFor(tab.icon,{id:section.icon});
    }
  }
  function updateHints(){
    for(const row of rows){
      const inputs=[budget,row.cost,row.limit],hint=inputs.every(input=>input.validity.valid)?
        budgetHint(budget.valueAsNumber,row.cost.valueAsNumber,row.limit.valueAsNumber):null;
      row.hint.hidden=!hint;
      row.hint.textContent=hint?.text??'';
      row.hint.dataset.field=hint?.field??'';
      for(const field of ['cost','limit']){
        if(hint?.field===field)row[field].setAttribute('aria-describedby',row.hint.id);
        else row[field].removeAttribute('aria-describedby');
      }
    }
  }
  function makeRow(){
    const element=label('li','shop-offer'),identity=label('div','shop-offer-item');
    const icon=label('span','shop-offer-icon'),name=label('span','shop-offer-name'),position=label('span','shop-offer-number');
    identity.append(position,icon,name);
    const fields=label('div','shop-offer-fields'),actions=label('div','shop-offer-actions');
    const hint=label('p','hint shop-budget-hint');
    hint.id='shop-budget-hint-'+rows.length;hint.hidden=true;
    const row={element,icon,name,position,hint};
    for(const [field,title,min,max] of [['count','Count',1,99],['cost','Price',0,1000000],['limit','Limit',1,41]]){
      const fieldLabel=label('label','',title),input=label('input');
      input.type='number';input.min=min;input.max=max;input.step='1';input.required=true;
      input.addEventListener('change',()=>number(input,{type:field,index:row.index}));
      if(field!=='count')input.addEventListener('input',updateHints);
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}});
      fieldLabel.append(input);fields.append(fieldLabel);row[field]=input;
    }
    row.up=button('Earlier',()=>apply({type:'move',index:row.index,to:row.previous},'up'));
    row.down=button('Later',()=>apply({type:'move',index:row.index,to:row.next},'down'));
    row.remove=button('Remove',()=>apply({type:'remove',index:row.index},'remove'));
    const sectionLabel=label('label','shop-offer-section','Section'),section=label('select');
    section.addEventListener('change',()=>apply({type:'section',index:row.index,value:section.value}));
    sectionLabel.append(section);fields.append(hint,sectionLabel);
    row.sectionLabel=sectionLabel;row.section=section;
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
    const sections=offers.length?shop.sections??[]:[];
    if(activeSection&&!sections.some(section=>section.id===activeSection)){activeSection='';page=0;}
    const indices=HeritageFlow.shopOfferIndices({offers},activeSection),view=paginate(indices,page);
    const sectionOptions=JSON.stringify(sections.map(({id,name})=>[id,name]));
    page=view.index;
    if(selection>=offers.length)selection=offers.length-1;
    budget.value=Number.isInteger(shop?.budget)?shop.budget:'';
    testShop.disabled=budget.disabled=locked||!offers.length;
    itemId.disabled=locked;
    addButton.disabled=locked||offers.length>=MAX_OFFERS;
    $('shop-count').textContent=offers.length?offers.length+' offer'+(offers.length===1?'':'s'):reason?.invalid?'':'Fixed kit';
    $('shop-empty').hidden=!!offers.length&&!reason;
    $('shop-empty').textContent=reason?.message??'Pick an item from the browser or enter an ID to start a shop.';
    $('shop-pages').hidden=!offers.length;
    renderSections(sections,!!offers.length);renderInlineTabs(sections);
    meter.alt='0 / '+(shop?.budget??0)+' points spent';
    $('shop-page').textContent=indices.length?'Page '+(page+1)+' of '+view.count+' · Offers '+(view.start+1)+'–'+(view.start+view.offers.length):'No offers in this section.';
    previous.disabled=page===0;next.disabled=page+1===view.count;
    while(rows.length>view.offers.length)rows.pop().element.remove();
    while(rows.length<view.offers.length)rows.push(makeRow());
    for(const [offset,index] of view.offers.entries()){
      const row=rows[offset],offer=offers[index],name=T.name(offer.item),position=view.start+offset;
      row.index=index;row.previous=indices[position-1];row.next=indices[position+1];row.position.textContent=String(index+1);
      iconFor(row.icon,offer.item);row.name.textContent=name;row.name.title=offer.item.id;
      row.count.value=offer.item.count??1;row.count.max=K.maxCount(offer.item);
      row.cost.value=offer.cost;row.limit.value=offer.limit??1;
      row.sectionLabel.hidden=!sections.length;row.section.disabled=locked;
      if(row.sectionOptions!==sectionOptions){
        row.section.replaceChildren(new Option('All offers only',''),...sections.map(section=>new Option(section.name,section.id)));
        row.sectionOptions=sectionOptions;
      }
      row.section.value=offer.section??'';
      row.section.setAttribute('aria-label','Section for offer '+(index+1)+', '+name);
      for(const [field,text] of [['count','Stack size'],['cost','Price in points'],['limit','Purchase limit']]){
        row[field].disabled=locked;row[field].setAttribute('aria-label',text+' for offer '+(index+1)+', '+name);
      }
      row.up.disabled=locked||row.previous===undefined;row.down.disabled=locked||row.next===undefined;row.remove.disabled=locked;
      for(const [action,text] of [['up','Move earlier'],['down','Move later'],['remove','Remove']])row[action].setAttribute('aria-label',text+' offer '+(index+1)+', '+name);
    }
    while(cells.length<PAGE_SIZE)cells.push(makeCell());
    for(const [offset,cell] of cells.entries()){
      const index=view.offers[offset];
      fillCell(cell,offers[index],index);
    }
    updateHints();highlight(selection);
  }
  function add(id){
    const name=K.items.get(K.normalize(id.trim()))?.name??id.trim();
    return apply({type:'add',id,section:activeSection},undefined,name+' added.');
  }
  addSection.addEventListener('click',()=>{
    if(apply({type:'add-section'}))sectionRows.at(-1)?.name.focus();
  });
  testShop.addEventListener('click',()=>{
    try{report();config.test();}
    catch(error){report(error.message,true);}
  });
  budget.addEventListener('input',updateHints);
  budget.addEventListener('change',()=>number(budget,{type:'budget'}));
  budget.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();budget.blur();}});
  form.addEventListener('submit',event=>{event.preventDefault();if(add(itemId.value)){itemId.value='';itemId.focus();}});
  previous.addEventListener('click',()=>{page--;render();});
  next.addEventListener('click',()=>{page++;render();});
  return {add,render,reset(){page=0;selection=-1;activeSection='';sectionsPanel.open=false;itemId.value='';report();render();}};
}
globalThis.HeritageShopEditor={create,edit,paginate,budgetHint};
if(typeof module!=='undefined')module.exports=globalThis.HeritageShopEditor;
})();
