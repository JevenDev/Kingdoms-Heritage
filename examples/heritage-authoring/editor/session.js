(() => {
'use strict';
function viewportBounds() {
  const viewport=window.visualViewport;
  let left=viewport?.offsetLeft??0,top=viewport?.offsetTop??0,right=left+(viewport?.width??innerWidth),bottom=top+(viewport?.height??innerHeight);
  const frame=window.frameElement;
  if(frame){
    const parent=frame.ownerDocument.defaultView,parentViewport=parent.visualViewport,rect=frame.getBoundingClientRect(),scaleX=rect.width/frame.offsetWidth,scaleY=rect.height/frame.offsetHeight;
    let clipLeft=parentViewport?.offsetLeft??0,clipTop=parentViewport?.offsetTop??0,clipRight=clipLeft+(parentViewport?.width??parent.innerWidth),clipBottom=clipTop+(parentViewport?.height??parent.innerHeight);
    for(let node=frame.parentElement;node;node=node.parentElement){
      const style=parent.getComputedStyle(node),bounds=node.getBoundingClientRect();
      if(/^(auto|scroll|hidden|clip)$/.test(style.overflowX)){clipLeft=Math.max(clipLeft,bounds.left);clipRight=Math.min(clipRight,bounds.right);}
      if(/^(auto|scroll|hidden|clip)$/.test(style.overflowY)){clipTop=Math.max(clipTop,bounds.top);clipBottom=Math.min(clipBottom,bounds.bottom);}
    }
    if(scaleX>0&&scaleY>0){
      const originX=rect.left+frame.clientLeft*scaleX,originY=rect.top+frame.clientTop*scaleY;
      left=Math.max(left,(clipLeft-originX)/scaleX);right=Math.min(right,(clipRight-originX)/scaleX);
      top=Math.max(top,(clipTop-originY)/scaleY);bottom=Math.min(bottom,(clipBottom-originY)/scaleY);
    }
  }
  return {left,top,right:Math.max(left,right),bottom:Math.max(top,bottom)};
}
function toolbarActions() {
  for(const menu of document.querySelectorAll('.document-actions-menu,.entry-actions-menu,.kit-help')){
    const help=menu.classList.contains('kit-help'),actions=menu.querySelector('.document-file-actions')??menu.querySelector(':scope > div');
    const compact=matchMedia('(max-width:620px), (max-height:600px)'),dropdown=()=>help||compact.matches||menu.hasAttribute('data-default-closed');
    const update=()=>{menu.open=!help&&!compact.matches&&!menu.hasAttribute('data-default-closed');if(!compact.matches)actions.style.maxHeight='';};
    const fit=()=>{
      if(!dropdown()||!menu.open)return;
      const available=Math.min(document.querySelector('main').getBoundingClientRect().bottom,viewportBounds().bottom)-actions.getBoundingClientRect().top-8;
      actions.style.maxHeight=Math.max(34,Math.min(help?560:Infinity,available))+'px';
    };
    update();compact.addEventListener('change',update);
    menu.addEventListener('toggle',fit);window.addEventListener('resize',fit);window.addEventListener('heritage:viewport-change',fit);
    document.addEventListener('pointerdown',event=>{if(dropdown()&&!menu.contains(event.target))menu.open=false;});
    menu.addEventListener('click',event=>{if(dropdown()&&event.target.closest('button,a,.file-button'))menu.open=false;});
    menu.addEventListener('change',event=>{if(dropdown()&&event.target.tagName==='SELECT')menu.open=false;});
    menu.addEventListener('keydown',event=>{
      if(!dropdown())return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary').focus();return;}
      if(event.target.tagName==='SELECT'||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      if(!menu.open&&!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();menu.open=true;
      const items=[...actions.querySelectorAll('button:not(:disabled),a[href]:not([aria-disabled=true]),select:not(:disabled),input:not(:disabled)')].filter(item=>item.getClientRects().length),index=items.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowUp'?(index<=0?items.length-1:index-1):(index+1)%items.length;items[next]?.focus();
    });
  }
}
async function acquire(key) {
  const main=document.querySelector('main');
  main.hidden=true;
  toolbarActions();
  let release,lockError='';
  const held=new Promise(resolve=>{release=resolve;});
  const available=globalThis.navigator?.locks?await new Promise(resolve=>{
    navigator.locks.request('heritage-editor:'+key,{ifAvailable:true},lock=>{
      resolve(!!lock);
      return lock?held:undefined;
    }).catch(error=>{lockError=error.message;resolve(false);});
  }):false;
  if(available) {
    window.addEventListener('pagehide',release,{once:true});
    window.addEventListener('pageshow',event=>{if(event.persisted){main.inert=true;location.reload();}});
    main.hidden=false;
    return true;
  }
  const notice=document.createElement('section');
  notice.className='session-notice';
  const heading=document.createElement('h2'),message=document.createElement('p'),button=document.createElement('button');
  heading.textContent=navigator.locks&&!lockError?'Already open in another tab':'Editing is unavailable';
  message.textContent=lockError?'Editing could not start: '+lockError+'. Reload this page to try again.':navigator.locks?'This tool allows one editing tab at a time to protect your saved work. Close the other tab, then continue here to load your latest changes. You can use the intro editor, kit creator and pack builder together.':'Open this site in a current browser using HTTPS or localhost to save safely.';
  button.type='button';button.className='primary';button.textContent='Continue editing';
  button.hidden=!navigator.locks;
  button.addEventListener('click',()=>location.reload());
  notice.append(heading,message,button);main.before(notice);
  return false;
}
function download(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function library({workspace,snapshot,activate,blank,kind,status,persist}) {
  const duplicate=document.getElementById('duplicate-'+kind),remove=document.getElementById('delete-'+kind),dialog=document.getElementById('delete-draft-dialog');
  duplicate.addEventListener('click',()=>{
    const state=snapshot();
    if(kind==='intro')state.name=(state.name||'My intro')+' copy';
    else {
      try {
        const value=JSON.parse(state.source);
        value.title=(value.title||'My kit')+' copy';
        state.source=JSON.stringify(value,null,2);state.document=value;
      }catch(error){status('Duplicated the unfinished draft with its original title.');}
    }
    activate(workspace().add(state));
  });
  remove.addEventListener('click',()=>dialog.showModal());
  document.getElementById('confirm-delete-draft').addEventListener('click',()=>{
    const drafts=workspace(),previous=drafts.active;
    if(drafts.entries.size===1)blank();
    else activate([...drafts.entries.keys()].find(id=>id!==previous));
    drafts.entries.delete(previous);
    persist();dialog.close();status('Draft deleted. Existing packs that used it will ask you to choose a replacement.');
    document.getElementById(kind==='kit'?'kit-drafts':'intro-drafts').dispatchEvent(new Event('change'));
  });
}
const api={acquire,download,library,viewportBounds};
if(typeof module!=='undefined')module.exports=api;
else {
  globalThis.HeritageSession=api;
  const frame=window.frameElement;
  if(frame){
    const parent=frame.ownerDocument.defaultView,changed=()=>window.dispatchEvent(new Event('heritage:viewport-change'));
    parent.document.addEventListener('scroll',changed,true);parent.addEventListener('resize',changed);
    window.addEventListener('pagehide',()=>{parent.document.removeEventListener('scroll',changed,true);parent.removeEventListener('resize',changed);},{once:true});
  }
}
})();
