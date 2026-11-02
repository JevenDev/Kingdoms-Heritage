(() => {
'use strict';
const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
function filter(records,query,kind='all'){const terms=normalize(query).trim().split(/\s+/).filter(Boolean);return records.filter(record=>(kind==='all'||record.kind===kind)&&terms.every(term=>normalize([record.name,record.detail,record.path].join(' ')).includes(term)));}
function create(config){
  const $=id=>document.getElementById(id),input=$('content-search'),select=$('content-filter'),results=$('content-search-results'),list=$('content-search-list');let lastKey='';
  function refresh(){
    const searching=!!input.value.trim()||select.value!=='all';$('select-locations').hidden=searching;$('location-count').hidden=searching;$('content-browser-regular').hidden=searching;results.hidden=!searching;$('clear-content-search').hidden=!searching;$('content-browser-heading').textContent=searching?'Pack content':'Locations';if(!searching)return;
    const found=filter(config.records(),input.value,select.value),key=JSON.stringify(found.map(record=>[record.kind,record.id,record.name,record.detail,record.current,record.image]));$('content-search-status').textContent=found.length?found.length+' result'+(found.length===1?'':'s'):'No matching content. Try another name or file path.';
    if(key===lastKey)return;lastKey=key;list.replaceChildren();let group;
    for(const record of found){
      if(group!==record.kind){group=record.kind;const heading=document.createElement('h3');heading.textContent=group==='location'?'Locations':group==='kit'?'Kits':'Intros';list.append(heading);}
      const button=document.createElement('button'),detail=document.createElement('span'),name=document.createElement('strong'),usage=document.createElement('span');button.type='button';button.className='content-asset content-search-result';button.dataset.contentKind=record.kind;button.dataset.contentId=record.id;button.draggable=record.kind==='kit';button.setAttribute('aria-haspopup','menu');button.dataset.tooltip=JSON.stringify(record.kind==='kit'?['Kit actions','Drag to reorder. Right-click for actions. Alt+Up/Down also reorders.']:record.kind==='location'?['Location actions','Right-click for actions. Alt+Up/Down changes menu order.']:['Intro actions','Right-click for actions. Shared edits affect every use.']);button.setAttribute('aria-current',String(record.current));button.setAttribute('aria-label','Open '+record.name+' · '+record.detail);name.textContent=record.name;usage.className='hint';usage.textContent=record.detail;detail.append(name,usage);
      if(record.image){const image=document.createElement('img');image.src=record.image;image.alt='';button.append(image);}button.append(detail);list.append(button);
    }
  }
  function clear(){input.value='';select.value='all';lastKey='';refresh();input.focus({preventScroll:true});}
  input.addEventListener('input',refresh);select.addEventListener('change',refresh);$('clear-content-search').addEventListener('click',clear);
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(input.value||select.value!=='all')clear();else config.leave();}});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-content-kind]');if(button)config.open(button.dataset.contentKind,button.dataset.contentId);});
  return {refresh};
}
const api={filter,create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageContentBrowser=api;
})();
