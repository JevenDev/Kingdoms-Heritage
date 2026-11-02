(() => {
'use strict';
function create(config){
  const $=id=>document.getElementById(id),strip=$('card-context-strip'),list=$('context-cards'),popup=$('card-text-editor'),input=$('card-text-value'),description=$('card-text-description'),error=$('card-text-error'),pagers=[$('pack-card-pagination'),$('location-card-pagination'),strip];
  let context,page=0,lastPack='',lastSelected='',lastSelectedPage=-1,stripKey='',draft=null,gesture=null,edgeTimer=0,ignoreClickUntil=0;
  const records=()=>context?.state.locations??[],resource=entry=>context.state.namespace+':'+entry.path,entry=id=>records().find(entry=>resource(entry)===id),editable=id=>!!entry(id),movable=id=>!!context?.model.ordered.some(spawn=>spawn.id===id),pages=()=>Math.max(1,Math.ceil((context?.model.ordered.length??0)/10));
  function closeText(focus=false){const canvas=popup.parentElement?.querySelector('canvas');draft=null;popup.hidden=true;error.hidden=true;if(focus)canvas?.focus({preventScroll:true});}
  function commitText(){
    if(!draft)return true;const field=draft.key==='description'?description:input,value=field.value;
    if(draft.key==='title'&&!value.trim()){error.textContent='Enter a card title.';error.hidden=false;field.setAttribute('aria-invalid','true');field.focus();return false;}
    const previous=draft;draft=null;if(config.editText(previous.id,previous.key,value,previous.original)===false){draft=previous;error.textContent='The card could not be updated. Keep this text and resolve the save issue.';error.hidden=false;return false;}closeText();return true;
  }
  function changePage(next){page=Math.max(0,Math.min(next,pages()-1));config.collapse();render();}
  function controls(){
    const total=context?.model.ordered.length??0,selected=context?.model.ordered.findIndex(spawn=>spawn.id===context.model.id)??0;
    for(const pager of pagers){
      for(const button of pager.querySelectorAll('[data-card-page]')){const action=button.dataset.cardPage;button.disabled=action==='previous'?page===0:action==='next'?page>=pages()-1:false;if(pager===strip)button.hidden=total<=10;else if(action==='current')button.hidden=Math.floor(Math.max(0,selected)/10)===page;}
      pager.querySelector('[data-card-page-status]').textContent=pager===strip?(page+1)+' / '+pages():'Page '+(page+1)+' of '+pages()+' · '+total+' cards';pager.querySelector('[data-card-page-status]').hidden=pager===strip&&total<=10;
    }
  }
  function render(){
    if(!context){strip.hidden=true;for(const pager of pagers.slice(0,2))pager.hidden=true;return;}
    const shown=context.model.ordered.slice(page*10,page*10+10),key=[context.packId,context.model.id,page,...shown.flatMap(spawn=>[spawn.id,spawn.title,spawn.title_key,spawn.image,context.pictureData[spawn.id]])];
    if(key.length!==stripKey.length||key.some((value,index)=>value!==stripKey[index])){stripKey=key;list.replaceChildren(...shown.map((spawn,index)=>{const button=document.createElement('button'),image=document.createElement('img'),name=document.createElement('span'),own=editable(spawn.id),canMove=movable(spawn.id),title=HeritageFlow.label(spawn,'title',context.translations);button.type='button';button.className='context-card';button.dataset.contextCard=spawn.id;button.draggable=canMove;button.disabled=!canMove;button.setAttribute('aria-pressed',String(spawn.id===context.model.id));button.setAttribute('aria-label',(page*10+index+1)+'. '+title+(own?'':'. Default location, reorder only'));button.dataset.tooltip=JSON.stringify([title,own?'Drag to reorder. Alt+Left/Right also moves cards.':'Drag to reorder. Default card content is read only.']);image.draggable=false;image.alt='';const builtin=/^kingdomsheritage:textures\/gui\/locations\/(default|random|plains|village)\.png$/.exec(spawn.image??'');image.src=context.pictureData[spawn.id]??'pack/assets/'+(builtin?.[1]??'card_fallback')+'.png';name.textContent=title;button.append(image,name);return button;}));}
    let host=$('location-editor').querySelector('.location-toolbar');if(context.embedded)host=$('content-editor').contentDocument?.querySelector('.author-content > .document-toolbar');
    if(host){const actions=host.querySelector('.document-actions-menu,.location-actions');if(strip.parentElement!==host||strip.nextSibling!==actions)host.insertBefore(strip,actions);}
    strip.hidden=!host||context.step!=='locations'||context.part==='details'&&!context.embedded;
    $('pack-card-pagination').hidden=context.step!=='pack'||!context.packCards||context.model.ordered.length<=10;
    $('location-card-pagination').hidden=context.step!=='locations'||context.part!=='details'||context.embedded||context.model.ordered.length<=10;
    controls();const active=list.querySelector('[aria-pressed=true]');if(active){const left=active.offsetLeft-list.offsetLeft;if(left<list.scrollLeft)list.scrollLeft=left;else if(left+active.offsetWidth>list.scrollLeft+list.clientWidth)list.scrollLeft=left+active.offsetWidth-list.clientWidth;}
  }
  function update(value){
    if(gesture&&(!value||value.embedded||value.step==='pack'&&!value.packCards||value.packId!==context?.packId||value.step!==context?.step||value.part!==context?.part||!value.model.ordered.some(spawn=>spawn.id===gesture.id)))gesture.cancel();
    context=value;if(!value){closeText();render();return;}
    const selectedPage=Math.max(0,Math.floor(value.model.ordered.findIndex(spawn=>spawn.id===value.model.id)/10));if(lastPack!==value.packId||lastSelected!==value.model.id||lastSelectedPage!==selectedPage){lastPack=value.packId;lastSelected=value.model.id;lastSelectedPage=selectedPage;page=selectedPage;}
    page=Math.min(page,pages()-1);if(draft&&(!entry(draft.id)||(entry(draft.id).fields[draft.key]??'')!==draft.original))closeText();render();
  }
  for(const pager of pagers)pager.addEventListener('click',event=>{const button=event.target.closest('[data-card-page]');if(!button)return;if(!commitText())return;changePage(button.dataset.cardPage==='current'?Math.floor(Math.max(0,context.model.ordered.findIndex(spawn=>spawn.id===context.model.id))/10):page+(button.dataset.cardPage==='next'?1:-1));});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-context-card]');if(button&&!button.disabled&&editable(button.dataset.contextCard)&&commitText())config.selectContext(button.dataset.contextCard);});
  strip.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();config.undo(event.key.toLowerCase()==='y'||event.shiftKey?1:-1);return;}
    const button=event.target.closest('[data-context-card]');if(!button||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();
    const ids=context.model.ordered.map(spawn=>spawn.id),index=ids.indexOf(button.dataset.contextCard),next=index+(event.key==='ArrowRight'?1:-1);if(next<0||next>=ids.length)return;
    if(event.altKey){if(commitText()){config.reorder(button.dataset.contextCard,ids[next],event.key==='ArrowRight');requestAnimationFrame(()=>list.querySelector('[data-context-card="'+CSS.escape(button.dataset.contextCard)+'"]')?.focus({preventScroll:true}));}}else if(editable(ids[next]))config.selectContext(ids[next]);else list.querySelector('[data-context-card="'+CSS.escape(ids[next])+'"]')?.focus({preventScroll:true});
  });
  let stripDrag='';list.addEventListener('dragstart',event=>{const button=event.target.closest('[data-context-card]');if(!button||button.disabled)return;stripDrag=button.dataset.contextCard;event.dataTransfer.setData('text/x-heritage-card',stripDrag);event.dataTransfer.effectAllowed='move';button.classList.add('dragging');});
  list.addEventListener('dragover',event=>{const button=event.target.closest('[data-context-card]');if(!stripDrag||!button||button.disabled)return;event.preventDefault();for(const node of list.children)node.classList.remove('drop-before','drop-after');const box=button.getBoundingClientRect();button.classList.add(event.clientX<box.left+box.width/2?'drop-before':'drop-after');});
  const clearStrip=()=>{stripDrag='';for(const node of list.children)node.classList.remove('dragging','drop-before','drop-after');};list.addEventListener('dragend',clearStrip);list.addEventListener('drop',event=>{const button=event.target.closest('[data-context-card]');if(!stripDrag||!button||button.disabled)return;event.preventDefault();if(commitText())config.reorder(stripDrag,button.dataset.contextCard,button.classList.contains('drop-after'));clearStrip();});
  function textFit(){
    const node=$('card-text-fit');if(!draft){node.hidden=true;return;}const spawn=context.model.ordered.find(spawn=>spawn.id===draft.id),fit=config.fit({...spawn,[draft.key]:draft.value,[draft.key+'_key']:undefined});node.textContent=draft.key==='title'&&fit.titleClipped?'Only 3 of '+fit.titleLines+' title lines fit in the game. Shorten the title to show all of it.':draft.key==='subtitle'&&fit.subtitleClipped?'Text after “'+fit.subtitleVisible+'” will be cut off in the game.':'';node.hidden=!node.textContent;
  }
  function openText(hit,scope,event){
    if(!commitText()||!editable(hit.id))return;if(config.editLocation(hit.id,{stay:true})===false)return;
    const record=entry(hit.id),key=hit.part,field=key==='description'?description:input;draft={id:hit.id,key,original:record.fields[key]??'',value:record.fields[key+'_key']?HeritageFlow.label(context.model.ordered.find(spawn=>spawn.id===hit.id),key,context.translations):record.fields[key]??''};input.hidden=key==='description';description.hidden=key!=='description';field.value=draft.value;field.setAttribute('aria-invalid','false');$('card-text-heading').textContent=key==='title'?'Card title':key==='subtitle'?'Card subtitle':'Card description';$('card-text-translation').hidden=!record.fields[key+'_key'];error.hidden=true;
    const monitor=document.getElementById(scope==='pack'?'pack-player-view':'location-card').parentElement,box=monitor.getBoundingClientRect();monitor.append(popup);popup.hidden=false;popup.style.left=Math.max(8,Math.min(event.clientX-box.left,box.width-336))+'px';popup.style.top=Math.max(8,Math.min(event.clientY-box.top-80,box.height-popup.offsetHeight-8))+'px';field.focus();field.select();textFit();
  }
  popup.addEventListener('input',event=>{if(!draft)return;draft.value=event.target.value;textFit();error.hidden=true;event.target.setAttribute('aria-invalid','false');});
  popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeText(true);}else if(event.key==='Enter'&&(draft?.key!=='description'||event.ctrlKey||event.metaKey)){event.preventDefault();if(commitText())popup.parentElement?.querySelector('canvas')?.focus({preventScroll:true});}});
  $('card-text-save').addEventListener('click',()=>{if(commitText())popup.parentElement?.querySelector('canvas')?.focus({preventScroll:true});});$('card-text-cancel').addEventListener('click',()=>closeText(true));
  document.addEventListener('click',event=>{if(draft&&!popup.contains(event.target)&&performance.now()>ignoreClickUntil&&!commitText()){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  function connect(scope,canvas,monitor){
    let imageTimer=0,feedbackTimer=0;const cancelImage=()=>clearTimeout(imageTimer);document.addEventListener('pointerdown',cancelImage,{capture:true});
    const marker=document.createElement('div'),markerLabel=document.createElement('span'),feedback=document.createElement('div'),feedbackTitle=document.createElement('strong'),feedbackHint=document.createElement('span');marker.className='card-drop-marker';marker.append(markerLabel);marker.hidden=true;feedback.className='card-drag-feedback';feedbackHint.className='hint';feedback.append(feedbackTitle,feedbackHint);feedback.hidden=true;canvas.parentElement.append(marker,feedback);
    const available=()=>context&&!context.embedded&&(scope==='pack'?context.packCards:context.part==='details');
    const name=id=>HeritageFlow.label(context.model.ordered.find(spawn=>spawn.id===id)??{},'title',context.translations)||'card';
    function showFeedback(title,hint='',complete=false){
      clearTimeout(feedbackTimer);feedbackTitle.textContent=title;feedbackHint.textContent=hint;feedback.hidden=false;feedback.classList.toggle('complete',complete);feedback.title=[title,hint].filter(Boolean).join('. ');
      const status=$('card-drag-status');if(status.textContent!==feedback.title)status.textContent=feedback.title;if(complete)feedbackTimer=setTimeout(()=>feedback.hidden=true,1400);
    }
    const clear=()=>{
      const current=gesture?.canvas===canvas?gesture:null;if(current){gesture=null;if(canvas.hasPointerCapture(current.pointer))canvas.releasePointerCapture(current.pointer);}
      clearTimeout(edgeTimer);clearTimeout(feedbackTimer);marker.hidden=feedback.hidden=true;monitor.endDrag();canvas.classList.remove('card-dragging');
    };
    function edge(direction){clearTimeout(edgeTimer);if(!direction||page+direction<0||page+direction>=pages())return;edgeTimer=setTimeout(()=>{if(!gesture?.dragging)return;changePage(page+direction);gesture.drop=null;monitor.previewOrder(null);marker.hidden=true;showFeedback('Move '+name(gesture.id),'Page '+(page+1)+' of '+pages()+' · Move over a card to choose its position');edge(direction);},600);}
    canvas.addEventListener('pointerdown',event=>{if(event.button!==0||!available()||!commitText())return;const hit=monitor.hit(event);if(!hit||!movable(hit.id))return;gesture={id:hit.id,hit,canvas,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,dragging:false,cancel:clear};canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});event.preventDefault();});
    canvas.addEventListener('pointermove',event=>{
      if(!available())return;const hit=monitor.hit(event);canvas.style.cursor=hit&&movable(hit.id)?hit.part==='image'||!editable(hit.id)?'grab':'text':'default';
      if(!gesture||gesture.canvas!==canvas)return;
      if(!gesture.dragging&&Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>6){
        if(!monitor.beginDrag(gesture.id,{clientX:gesture.startX,clientY:gesture.startY})){clear();return;}gesture.dragging=true;config.collapse();canvas.classList.add('card-dragging');
      }
      if(!gesture.dragging)return;monitor.moveDrag(event);
      const box=canvas.getBoundingClientRect(),inside=event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom,drop=inside?monitor.drop(event,movable):null,ids=context.model.ordered.map(spawn=>spawn.id),others=ids.filter(id=>id!==gesture.id),position=drop?others.indexOf(drop.id)+(drop.after?1:0):-1;
      gesture.drop=drop&&drop.id!==gesture.id&&position!==ids.indexOf(gesture.id)?drop:null;gesture.inside=inside;
      if(gesture.drop){
        const proposed=others.slice();proposed.splice(position,0,gesture.id);const gap=monitor.previewOrder(proposed)??drop;
        marker.hidden=false;marker.style.left=(canvas.offsetLeft+gap.x)+'px';marker.style.top=(canvas.offsetTop+gap.y)+'px';marker.style.height=gap.height+'px';markerLabel.textContent=drop.after?'After':'Before';gesture.placement=(drop.after?'after ':'before ')+name(drop.id);showFeedback(name(gesture.id)+' · '+gesture.placement,'Release to reorder · Esc to cancel');
      }else{monitor.previewOrder(null);marker.hidden=true;showFeedback('Move '+name(gesture.id),inside?'Choose a new position · Esc to cancel':'Outside preview · Release to cancel');}
      edge(!inside?0:event.clientX<box.left+24?-1:event.clientX>box.right-24?1:0);
    });
    canvas.addEventListener('pointerup',event=>{
      if(!gesture||gesture.canvas!==canvas)return;const move=gesture,hit=move.hit,source=name(move.id);clear();ignoreClickUntil=performance.now()+250;
      if(move.dragging){
        if(move.drop){const changed=config.reorder(move.id,move.drop.id,move.drop.after);showFeedback(changed===false?'Card order could not be updated':'Moved '+source+' '+move.placement,'',true);}
        else showFeedback(move.inside?'Card order unchanged':'Move cancelled','',true);return;
      }
      if(!editable(hit.id))return;
      if(hit.part==='image'){const packId=context.packId,step=context.step;imageTimer=setTimeout(()=>{if(available()&&context.packId===packId&&context.step===step)config.editLocation(hit.id);},240);}else openText(hit,scope,event);
    });
    canvas.addEventListener('pointercancel',clear);canvas.addEventListener('lostpointercapture',()=>{if(gesture?.canvas===canvas)clear();});
    window.addEventListener('blur',()=>{if(gesture?.canvas===canvas)clear();});window.addEventListener('resize',()=>{if(gesture?.canvas===canvas)clear();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&gesture?.canvas===canvas)clear();});
    canvas.addEventListener('dblclick',event=>{if(!available())return;const hit=monitor.hit(event);if(hit?.part==='image'&&editable(hit.id)){event.preventDefault();cancelImage();config.crop(hit.id);}});
    canvas.addEventListener('keydown',event=>{if(!available())return;if(event.key==='Escape'&&gesture?.canvas===canvas){event.preventDefault();clear();showFeedback('Move cancelled','',true);return;}if(['PageUp','PageDown'].includes(event.key)){event.preventDefault();if(gesture)clear();changePage(page+(event.key==='PageDown'?1:-1));}else if(event.key==='Enter'&&!gesture){event.preventDefault();const box=canvas.getBoundingClientRect();openText({id:context.model.id,part:'title'},scope,{clientX:box.left+box.width/2,clientY:box.top+box.height/2});}});
  }
  return {update,connect,detach:()=>{const host=$('location-editor').querySelector('.location-toolbar');host.insertBefore(strip,host.querySelector('.location-actions'));strip.hidden=true;},page:()=>page,commit:commitText,preview:spawns=>draft?spawns.map(spawn=>spawn.id===draft.id?{...spawn,[draft.key]:draft.value,[draft.key+'_key']:undefined}:spawn):spawns};
}
globalThis.HeritageCardTools={create};
})();
