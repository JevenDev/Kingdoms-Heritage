(() => {
'use strict';
function toolbarActions() {
  const menu=document.querySelector('.document-actions-menu');
  if(!menu)return;
  const compact=matchMedia('(max-width:620px), (max-height:600px)');
  const update=()=>{menu.open=!compact.matches;if(!compact.matches)menu.querySelector('.document-file-actions').style.maxHeight='';};
  const fit=()=>{
    if(!compact.matches||!menu.open)return;
    const actions=menu.querySelector('.document-file-actions');
    actions.style.maxHeight=Math.max(34,document.querySelector('main').getBoundingClientRect().bottom-actions.getBoundingClientRect().top-8)+'px';
  };
  update();compact.addEventListener('change',update);
  menu.addEventListener('toggle',fit);window.addEventListener('resize',fit);
  document.addEventListener('pointerdown',event=>{if(compact.matches&&!menu.contains(event.target))menu.open=false;});
  menu.addEventListener('click',event=>{if(compact.matches&&event.target.closest('button,a,.file-button'))menu.open=false;});
  menu.addEventListener('change',event=>{if(compact.matches&&event.target.tagName==='SELECT')menu.open=false;});
  menu.addEventListener('keydown',event=>{if(compact.matches&&event.key==='Escape'){event.preventDefault();menu.open=false;menu.querySelector('summary').focus();}});
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
  message.textContent=lockError?'Editing could not start: '+lockError+'. Reload this page to try again.':navigator.locks?'This tool allows one editing tab at a time to protect your saved work. Close the other tab, then continue here to load your latest changes. You can use the intro editor, kit creator and pack assembler together.':'Open this site in a current browser using HTTPS or localhost to save safely.';
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
const api={acquire,download,library};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageSession=api;
})();
