(() => {
'use strict';
const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
function filter(records,query,kind='all'){const terms=normalize(query).trim().split(/\s+/).filter(Boolean);return records.filter(record=>(kind==='all'||record.kind===kind)&&terms.every(term=>normalize([record.name,record.detail,record.path].join(' ')).includes(term)));}
function create(config){
  const $=id=>document.getElementById(id),input=$('content-search'),select=$('content-filter'),results=$('content-search-results'),list=$('content-search-list'),tabs=document.createElement('nav'),add=document.createElement('button');
  let lastKey='';const queries=new Map();
  tabs.className='content-collections';tabs.setAttribute('aria-label','Content collections');
  for(const [kind,label] of [['location','Locations'],['kit','Kits'],['intro','Intros'],['all','All']]){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.collection=kind;button.addEventListener('click',()=>{if(config.choose?.(kind)!==false)show(kind);});tabs.append(button);
  }
  $('content-browser-heading').textContent='Pack content';select.hidden=true;select.parentElement.before(tabs);select.parentElement.classList.add('collection-search');
  const requested=new URLSearchParams(location.search).get('collection');select.value=['location','kit','intro','all'].includes(requested)?requested:'location';
  add.type='button';add.className='primary';add.id='new-content-entry';add.addEventListener('click',()=>config.create(select.value));results.after(add);
  $('content-browser-regular').before($('location-selection-controls'),$('bulk-location-actions'));
  const library=document.querySelector('.pack-library');library.querySelector('summary').textContent='Library & file settings';$('pack-content-browser').append(library);
  document.querySelector('.location-toolbar').append(document.querySelector('.location-sections'));
  $('location-editor').prepend($('shared-entry-context'));document.querySelector('.content-bin').hidden=true;
  function refresh(){
    const kind=select.value,records=config.records(kind),found=filter(records,input.value,kind),locations=new Set(found.filter(record=>record.kind==='location').map(record=>record.id)),assets=found.filter(record=>record.kind!=='location'),showLocations=kind==='location'||kind==='all';
    $('select-locations').hidden=!showLocations;$('location-count').hidden=true;$('content-browser-regular').hidden=!showLocations;
    for(const row of $('locations').children)row.hidden=!locations.has(row.querySelector('[data-open-location]')?.dataset.openLocation);
    results.hidden=!assets.length&&!input.value.trim()&&showLocations;$('clear-content-search').hidden=!input.value.trim();
    $('content-search-status').textContent=found.length?found.length+' '+(input.value.trim()?'result'+(found.length===1?'':'s'):'entr'+(found.length===1?'y':'ies')):'No matching content.';
    add.hidden=!['kit','intro'].includes(kind);add.textContent='New '+kind;
    for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.dataset.collection===kind));
    const key=JSON.stringify([kind,assets.map(record=>[record.kind,record.id,record.name,record.detail,record.current,record.image])]);
    if(key===lastKey)return;lastKey=key;list.replaceChildren();let group;
    for(const record of assets){
      if(kind==='all'&&group!==record.kind){group=record.kind;const heading=document.createElement('h3');heading.textContent=group==='kit'?'Kits':'Intros';list.append(heading);}
      const button=document.createElement('button'),detail=document.createElement('span'),name=document.createElement('strong'),usage=document.createElement('span');button.type='button';button.className='content-asset content-search-result';button.dataset.contentKind=record.kind;button.dataset.contentId=record.id;button.draggable=record.kind==='kit';button.setAttribute('aria-haspopup','menu');button.dataset.tooltip=JSON.stringify(record.kind==='kit'?['Kit actions','Drag to reorder. Right-click for actions. Alt+Up/Down also reorders.']:['Intro actions','Right-click for actions. Shared edits affect every use.']);button.setAttribute('aria-current',String(record.current));button.setAttribute('aria-label','Open '+record.name+' · '+record.detail);name.textContent=record.name;usage.className='hint';usage.textContent=record.detail;detail.append(name,usage);
      if(record.image){const image=document.createElement('img');image.src=record.image;image.alt='';button.append(image);}button.append(detail);list.append(button);
    }
  }
  function show(kind){if(kind!==select.value){queries.set(select.value,input.value);input.value=queries.get(kind)??'';}select.value=kind;refresh();const url=new URL(location.href);url.searchParams.set('collection',kind);history.replaceState(null,'',url);}
  function clear(){input.value='';lastKey='';refresh();input.focus({preventScroll:true});}
  input.addEventListener('input',refresh);select.addEventListener('change',refresh);$('clear-content-search').addEventListener('click',clear);
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(input.value)clear();else config.leave();}});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-content-kind]');if(button)config.open(button.dataset.contentKind,button.dataset.contentId);});
  return {refresh,show,visibleLocations:()=>filter(config.records('location'),input.value,select.value).filter(record=>record.kind==='location').map(record=>record.id)};
}
const api={filter,create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageContentBrowser=api;
})();
