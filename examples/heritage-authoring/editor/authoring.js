(() => {
'use strict';
const embeddedRoute=new URLSearchParams(location.search),embedded=embeddedRoute.get('embedded')==='1'&&window.parent!==window;
if(embedded)document.body.dataset.embedded='true';
function create(config){
  const $=id=>document.getElementById(id),W=HeritageWorkflow,stages=embedded?config.stages.filter(stage=>stage.id!=='review'):config.stages,first=stages[0].id;
  const shared=document.createElement('div'),sharedText=document.createElement('p'),copyLocal=document.createElement('button');shared.className='author-shared-context';sharedText.className='hint';copyLocal.type='button';copyLocal.textContent='Make a copy for this location';shared.append(sharedText,copyLocal);document.querySelector('.author-content > .document-toolbar').after(shared);
  if(config.kind==='kit'){
    const toolbar=document.querySelector('.author-content > .document-toolbar'),history=document.createElement('div');history.className='intro-history-actions';history.setAttribute('role','group');history.setAttribute('aria-label','Kit history');history.append($('undo'),$('redo'));toolbar.querySelector('.document-actions-menu').before(history);toolbar.querySelector('.document-file-actions').prepend($('json-tab'));toolbar.append(document.querySelector('.author-footer'));document.querySelector('.kit-inventory-panel').append(document.querySelector('.kit-extra-equipment'));
  }
  const actions=document.querySelector('.document-toolbar .document-file-actions');actions.append($('author-use-another'),$('author-preview-pack'));$('author-stage-status').classList.add('sr-only');
  const saveContext=document.createElement('div'),usageNote=document.createElement('span'),saveStatus=$(config.kind==='kit'?'draft-status':'intro-draft-status');saveContext.className='document-save-context';usageNote.className='document-usage hint';usageNote.hidden=true;saveStatus.before(saveContext);saveContext.append(usageNote);const navStatus=document.createElement('div');navStatus.className='nav-save-status';navStatus.setAttribute('role','status');navStatus.setAttribute('aria-live','polite');navStatus.setAttribute('aria-atomic','true');saveStatus.removeAttribute('role');navStatus.append(saveStatus);document.querySelector('header h1').after(navStatus);
  const saveFeedback=()=>{saveStatus.title=saveStatus.textContent;if(embedded)window.parent.postMessage({type:'heritage:author-save-status',token:embeddedRoute.get('session'),message:saveStatus.textContent,valid:!config.issue()},location.origin);};new MutationObserver(saveFeedback).observe(saveStatus,{childList:true,subtree:true});saveFeedback();
  let current=first,busy=false,attachPending=embeddedRoute.get('attach')==='1';
  const sharedUsage=(count,places)=>{usageNote.hidden=count<2;usageNote.textContent='Shared by '+count+' locations';usageNote.title=places;};
  const embeddedStatus=()=>({kind:config.kind,id:config.active(),attach:attachPending,valid:!config.issue()});
  function saved(){if(embedded)window.parent.postMessage({type:'heritage:author-saved',token:embeddedRoute.get('session'),...embeddedStatus()},location.origin);}
  if(embedded){
    let searchFocus;document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopPropagation();searchFocus=document.activeElement;window.parent.postMessage({type:'heritage:author-search',token:embeddedRoute.get('session')},location.origin);}});
    window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='heritage:author-search-close'&&event.data.token===embeddedRoute.get('session')){window.focus();if(searchFocus?.isConnected)searchFocus.focus({preventScroll:true});}});
    globalThis.HeritageEmbeddedEditor={flush:()=>{const persisted=config.persist();return {...embeddedStatus(),persisted};}};
    document.addEventListener('click',event=>{if(event.target.closest('#duplicate-'+config.kind))attachPending=true;if(event.target.closest('#delete-'+config.kind))attachPending=false;},{capture:true});
    window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='heritage:author-usage'&&event.data.token===embeddedRoute.get('session'))sharedUsage(event.data.count,event.data.places);});
    window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='heritage:author-connected'&&event.data.token===embeddedRoute.get('session')&&event.data.id===config.active())attachPending=false;});
    for(const link of document.querySelectorAll('a[href]')){link.target='_blank';link.rel='noopener';}
    const resize=()=>window.parent.postMessage({type:'heritage:author-size',token:embeddedRoute.get('session'),height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin);new ResizeObserver(resize).observe(document.body);
  }
  const source=()=>W.context(location.search,localStorage.getItem(HeritageProject.keys.packs));
  const report=message=>{$('author-feedback').textContent=message;};
  function reveal(){const issue=config.issue();if(!issue)return;show(issue.stage);const field=$(issue.field);if(field){for(let parent=field.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field.focus();}report(issue.message);}
  function show(value,{focus=true,route=true}={}){
    if(focus)report('');
    current=value==='json'||stages.some(stage=>stage.id===value)?value:first;
    document.body.dataset.authorStage=current;
    for(const panel of document.querySelectorAll('[data-author-panel]'))panel.hidden=panel.dataset.authorPanel!==current;
    if($('settings'))$('settings').hidden=!['layout','cinematic'].includes(current);
    for(const button of document.querySelectorAll('.author-steps [data-author-step]')){button.hidden=embedded&&!stages.some(stage=>stage.id===button.dataset.authorStep);if(button.dataset.authorStep===current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
    const index=stages.findIndex(stage=>stage.id===current),stage=stages[index];
    $('author-heading').textContent=stage?.heading??'Edit JSON';$('author-stage-help').textContent=stage?.help??'Direct changes keep supported extra fields and update the live preview.';
    $('author-back').hidden=index<=0;$('author-next').hidden=embedded||current==='review'||current==='json';$('author-stage-status').textContent=index<0?'Advanced editor':(index+1)+' of '+stages.length;
    $('author-next').textContent='Next';$('author-next').setAttribute('aria-label','Continue to '+(stages[index+1]?.label??'review'));document.querySelector('.author-finish').hidden=current!=='review';
    $('json-tab').hidden=current==='json';$(config.kind==='kit'?'details-tab':'text-tab').hidden=current!=='json';
    if($('inventory'))$('inventory').inert=current!=='inventory';
    if(route){const url=new URL(location.href);url.searchParams.set('edit',current);history.replaceState(null,'',url);}
    config.stageChanged?.(current);refresh();if(embedded)window.parent.postMessage({type:'heritage:author-stage',token:embeddedRoute.get('session'),kind:config.kind,id:config.active(),stage:current},location.origin);
    if(focus){$('author-heading').focus({preventScroll:true});document.querySelector('.author-scroll-content').scrollTop=0;}
  }
  function refresh(){
    const entries=config.entries(),id=config.active(),entry=entries.find(entry=>entry.id===id);if(!entry)return;
    const context=W.editor(config.kind,id),list=$('author-entries');$('author-title').textContent=entry.name;$('author-entry-count').textContent=String(entries.length);
    const ids=entries.map(entry=>entry.id);if(list.children.length!==ids.length||ids.some((id,index)=>list.children[index]?.dataset.id!==id)){
      list.replaceChildren(...entries.map(entry=>{const li=document.createElement('li'),button=document.createElement('button'),name=document.createElement('strong'),detail=document.createElement('span');li.dataset.id=entry.id;button.type='button';button.dataset.authorEntry=entry.id;button.append(name,detail);li.append(button);return li;}));
    }
    let pack;try{pack=JSON.parse(localStorage.getItem(HeritageProject.keys.packs))?.projects?.find(entry=>entry.id===context?.packId)?.state;}catch(error){report('Pack context could not load: '+error.message);}
    for(const [index,entry] of entries.entries()){
      const button=list.children[index].firstElementChild,used=W.usage(pack,config.kind,entry.id);
      button.setAttribute('aria-current',String(entry.id===id));button.firstElementChild.textContent=entry.name;button.lastElementChild.textContent=used.length?'Used in '+used.map(location=>location.fields.title||'Unnamed location').join(', '):entry.detail;
    }
    const summary=config.summary();$('author-review-title').textContent=summary.title;$('author-review-description').textContent=summary.description;
    $('author-review-summary').replaceChildren(...summary.lines.map(line=>{const li=document.createElement('li');li.textContent=line;return li;}));
    const used=W.usage(pack,config.kind,id);
    let allUsage=[];try{for(const project of JSON.parse(localStorage.getItem(HeritageProject.keys.packs)??'null')?.projects??[])for(const location of W.usage(project.state,config.kind,id))allUsage.push(project.state.name+' / '+(location.fields.title||'Untitled location'));}catch(error){report('Shared usage could not load: '+error.message);}
    sharedUsage(allUsage.length,allUsage.join(', '));shared.hidden=embedded||!allUsage.length;sharedText.textContent=allUsage.length?'Used by '+allUsage.length+' location'+(allUsage.length===1?'':'s')+'. Changes apply everywhere it is used.':'';sharedText.title=allUsage.join(', ');copyLocal.hidden=!context||context.missing;copyLocal.disabled=busy;
    $('author-usage').textContent=used.length?'Used in '+used.map(location=>location.fields.title||'Unnamed location').join(', ')+'. Changes affect every location using this '+config.kind+'.':context&&!context.missing?'This '+config.kind+' will be connected to '+context.locationName+'.':'Saved in this browser’s '+config.kind+' library.';
    $('author-use-another').hidden=!context||context.missing;$('author-use-another').disabled=busy;
    $('author-preview-pack').hidden=!context||context.missing;$('author-preview-pack').href=W.packUrl(config.kind,id,{...context,step:'preview'});
    const ready=!config.issue();$('author-fix').hidden=ready;$('author-download').disabled=!ready;for(const link of [$('use-in-pack'),$('author-preview-pack')])link.setAttribute('aria-disabled',String(!ready));
  }
  for(const button of document.querySelectorAll('[data-author-step]'))button.addEventListener('click',()=>show(button.dataset.authorStep));
  $('author-entries').addEventListener('click',event=>{const button=event.target.closest('[data-author-entry]');if(!button)return;config.select(button.dataset.authorEntry);refresh();});
  $('author-back').addEventListener('click',()=>show(stages[stages.findIndex(stage=>stage.id===current)-1]?.id));
  $('author-next').addEventListener('click',()=>show(stages[stages.findIndex(stage=>stage.id===current)+1]?.id));
  $('author-fix').addEventListener('click',reveal);
  $('author-preview-jump').addEventListener('click',()=>{const target=$('preview')??$('inventory');target.scrollIntoView({block:'center'});if($('preview'))target.focus({preventScroll:true});});
  document.querySelector('.author-content').addEventListener('input',()=>report(''));
  $('author-download').addEventListener('click',()=>$(config.kind==='kit'?'download':'download-intro').click());
  document.querySelector('.workflow-nav').addEventListener('click',event=>{const link=event.target.closest('[data-pack-stage]');if(link&&['preview','export'].includes(link.dataset.packStage)&&!config.prepare()){event.preventDefault();reveal();}});
  for(const link of [$('use-in-pack'),$('author-preview-pack')])link.addEventListener('click',event=>{if(!config.prepare()){event.preventDefault();reveal();}});
  $('author-use-another').addEventListener('click',async()=>{
    if(busy||!config.prepare()){reveal();return;}busy=true;refresh();
    try{
      await navigator.locks.request('heritage-editor:heritage.packAssembler.v1',{ifAvailable:true},lock=>{
        if(!lock)throw new Error('Close the pack builder tab before connecting another '+config.kind+'. Your draft is saved.');
        const context=source(),raw=localStorage.getItem(HeritageProject.keys.packs);if(!raw)throw new Error('The original pack is unavailable. Return to the pack builder.');
        const projects=new HeritageProject.Projects(localStorage),entry=config.entries().find(entry=>entry.id===config.active());
        const next=W.connected(projects.serialize(),context,config.kind,entry.id,entry.name);HeritageProject.write(localStorage,{[HeritageProject.keys.packs]:next});
        config.newEntry();show(first);report(entry.name+' connected to '+context.locationName+'. New '+config.kind+' ready.');
      });
    }catch(error){report('Could not connect '+config.kind+': '+error.message);}finally{busy=false;refresh();}
  });
  copyLocal.addEventListener('click',async()=>{
    if(busy)return;if(!config.prepare()){reveal();return;}busy=true;refresh();
    try{
      await navigator.locks.request('heritage-editor:heritage.packAssembler.v1',{ifAvailable:true},lock=>{
        if(!lock)throw new Error('Use Make a copy for this location in the open pack builder.');
        const context=source();if(!context||context.missing)throw new Error('The original location is unavailable.');
        const projects=new HeritageProject.Projects(localStorage),project=projects.projects.find(entry=>entry.id===context.packId);if(!project)throw new Error('The original pack is unavailable.');
        const libraries=Object.fromEntries(['kits','intros'].map(kind=>[kind,HeritageProject.library(JSON.parse(localStorage.getItem(HeritageProject.keys[kind])??'null'),kind)]));
        const id=crypto.randomUUID(),next=HeritageEditing.privateCopy(project.state,libraries,config.kind,config.active(),context.locationId,id),kind=config.kind==='kit'?'kits':'intros';project.state=next.pack;
        HeritageProject.write(localStorage,{[HeritageProject.keys.packs]:projects.serialize(),[HeritageProject.keys[kind]]:next.libraries[kind]});config.adopt(next.libraries[kind][kind].find(entry=>entry.id===id));report('This copy is connected only to '+context.locationName+'.');
      });
    }catch(error){report('Could not make a local copy: '+error.message);}finally{busy=false;refresh();}
  });
  const compact=matchMedia('(max-width:850px)'),collection=$('entry-collection');collection.open=!compact.matches;compact.addEventListener('change',()=>{collection.open=!compact.matches;});
  window.addEventListener('storage',event=>{if(event.key===HeritageProject.keys.packs)refresh();});
  const requested=new URLSearchParams(location.search).get('edit');show(config.issue()?.stage??requested??first,{focus:false});
  if(embedded)requestAnimationFrame(()=>config.persist());
  return {show,refresh,reveal,saved,get current(){return current;}};
}
globalThis.HeritageAuthoring={create};
})();
