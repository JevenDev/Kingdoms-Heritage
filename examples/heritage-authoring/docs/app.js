(() => {
'use strict';
const {pages,styles}=HeritageDocs,$=id=>document.getElementById(id);
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const slug=value=>value.toLowerCase().replaceAll("'",'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
let current=null,kitViews=[];
function clearKits(){for(const view of kitViews)view.destroy();kitViews=[];}
const routes={'README.md':'getting-started','REFERENCE.md':'spawns'};
const sectionRoutes={'replace-or-remove-bundled-options':'overrides','custom-names-and-languages':'resources','card-images':'resources','safe-templates':'examples','whats-included':'examples','useful-commands':'commands','troubleshooting':'troubleshooting'};
function url(value) {
  const [file,anchor]=value.split('#');
  if(routes[file])return '#/'+(sectionRoutes[anchor]||routes[file])+(anchor?'/'+anchor:'');
  return value;
}
function inline(source) {
  const saved=[];
  let text=source.replace(/\x60([^\x60]+)\x60/g,(_,value)=>{saved.push('<code>'+escape(value)+'</code>');return '\u0000'+(saved.length-1)+'\u0000';});
  text=escape(text).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,href)=>'<img loading="lazy" src="'+escape(href)+'" alt="'+alt+'">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,href)=>'<a href="'+escape(url(href))+'">'+label+'</a>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  return text.replace(/\u0000(\d+)\u0000/g,(_,index)=>saved[Number(index)]);
}
function markdown(source) {
  const lines=source.split('\n'),html=[],headings=[],ids=new Map();
  const boundary=line=>/^#{1,6} |^~~~|^\x60{3}|^\| |^[-*] |^\d+\. /.test(line);
  for(let i=0;i<lines.length;) {
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(/^(~~~|\x60{3})/.test(line)) {
      const fence=line.slice(0,3),language=line.slice(3).trim(),code=[];
      while(++i<lines.length&&!lines[i].startsWith(fence))code.push(lines[i]);
      i++;
      html.push('<div class="code-block"><div class="code-toolbar"><span>'+escape(language||'text')+'</span><button type="button" class="copy-code">Copy</button></div><pre><code data-language="'+escape(language)+'">'+escape(code.join('\n'))+'</code></pre></div>');
    } else if(/^#{1,6} /.test(line)) {
      const level=line.indexOf(' '),title=line.slice(level+1),base=slug(title),count=ids.get(base)||0,id=base+(count?'-'+count:'');
      ids.set(base,count+1);headings.push({title:title.replaceAll(String.fromCharCode(96),''),id,level});
      html.push('<h'+level+' id="'+id+'">'+inline(title)+'</h'+level+'>');i++;
    } else if(line.startsWith('|')) {
      const rows=[];
      while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++].replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim()));
      html.push('<div class="table-scroll"><table><thead><tr>'+rows[0].map(cell=>'<th scope="col">'+inline(cell)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(2).map(row=>'<tr>'+row.map(cell=>'<td>'+inline(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');
    } else if(/^[-*] |^\d+\. /.test(line)) {
      const ordered=/^\d/.test(line),items=[];
      while(i<lines.length&&(ordered?/^\d+\. /:/^[-*] /).test(lines[i]))items.push(lines[i++].replace(/^([-*]|\d+\.) /,''));
      html.push((ordered?'<ol>':'<ul>')+items.map(item=>'<li>'+inline(item)+'</li>').join('')+(ordered?'</ol>':'</ul>'));
    } else {
      const paragraph=[line];i++;
      while(i<lines.length&&lines[i].trim()&&!boundary(lines[i]))paragraph.push(lines[i++]);
      html.push('<p>'+inline(paragraph.join(' '))+'</p>');
    }
  }
  return {html:html.join('\n'),headings};
}
function icons(root=document) {
  for(const node of root.querySelectorAll('[data-icon]'))if(!node.querySelector('.lucide'))node.prepend(HeritageIcons.create(node.dataset.icon));
  for(const button of root.querySelectorAll('.copy-code'))button.prepend(HeritageIcons.create('copy'));
}
function highlight(node) {
  const text=node.textContent,tokens=/"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,fragment=document.createDocumentFragment();let end=0;
  for(const match of text.matchAll(tokens)) {
    fragment.append(document.createTextNode(text.slice(end,match.index)));
    const span=document.createElement('span'),token=match[0];
    span.className=token.startsWith('"')?(/^\s*:/.test(text.slice(match.index+token.length))?'json-key':'json-string'):/^(true|false|null)$/.test(token)?'json-literal':'json-number';
    span.textContent=token;fragment.append(span);end=match.index+token.length;
  }
  fragment.append(document.createTextNode(text.slice(end)));node.replaceChildren(fragment);
}
function nav(page) {
  const groups=[...new Set(pages.map(item=>item.group))];
  $('docs-nav').innerHTML=groups.map(group=>'<div class="nav-group"><h2>'+escape(group)+'</h2>'+pages.filter(item=>item.group===group).map(item=>'<a href="#/'+item.id+'"'+(item.id===page?' aria-current="page"':'')+'>'+escape(item.title)+'</a>').join('')+'</div>').join('');
}
function sampleMarkup(sample,index) {
  const intro=JSON.stringify({text:sample.text,...sample.config},null,2),href='gallery.html?intro='+encodeURIComponent(intro);
  return '<section class="sample" id="sample-'+sample.id+'" data-sample-index="'+index+'"><h3>'+escape(sample.title)+'</h3><p>'+escape(sample.description)+'</p><canvas role="img" aria-label="'+escape(sample.title)+' text preview"></canvas><div class="code-block"><pre><code>'+escape(sample.text.replaceAll('\n','\\n'))+'</code></pre><div class="sample-actions"><button type="button" class="copy-text" data-icon="copy">Copy text</button><button type="button" class="copy-intro" data-icon="braces">Copy intro JSON</button><a href="'+escape(href)+'" data-icon="external-link">Try in editor</a></div></div></section>';
}
let kitRenderer;
const kitBase=new URL('../kit/',document.currentScript.src);
function loadKitScript(file) {
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL(file,kitBase);
    script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Kit preview scripts could not load.'));};
    document.head.append(script);
  });
}
function loadKitRenderer() {
  return kitRenderer??=(async()=>{
    await Promise.all(['catalog.js','equipment-data.js','player-data.js','examples.js'].map(loadKitScript));
    await loadKitScript('engine.js');
    await Promise.all(['equipment.js','player.js','text.js'].map(loadKitScript));
    await loadKitScript('view.js');
  })().catch(error=>{kitRenderer=null;throw error;});
}
async function kitPreviews(anchor) {
  const host=document.createElement('div');host.className='kit-samples';
  const loading=document.createElement('p');loading.setAttribute('role','status');loading.textContent='Loading kit previews…';host.append(loading);anchor.after(host);
  try{
    await loadKitRenderer();if(!anchor.isConnected)return;host.replaceChildren();
    const equipmentSamples=['curios','accessories'].map(inventory=>({id:inventory,mode:inventory,kit:{title:inventory==='curios'?'Curios equipment':'Accessories equipment',description:'A ring slot with a separate cosmetic item.',items:[{inventory,slot:'ring',index:0,item:{id:'minecraft:diamond'}},{inventory,slot:'ring',index:0,cosmetic:true,item:{id:'minecraft:emerald'}},{index:0,item:{id:'minecraft:compass'}}]}}));
    const samples=[...HeritageKitExamples,...equipmentSamples].map(sample=>{
      const profiles=HeritageEquipment.defaults(),firstEquipment=sample.kit.items.find(entry=>['curios','accessories'].includes(entry.inventory));
      return {...sample,options:{mode:sample.mode||'player',profiles,cosmetics:sample.mode==='accessories',offset:firstEquipment?HeritageEquipment.reveal(sample.kit,profiles,HeritageEquipment.id(firstEquipment)):0}};
    });
    const width=Math.max(...samples.map(sample=>HeritageEquipment.layout(sample.kit,sample.options).width));
    host.style.setProperty('--kit-preview-width',width*2+'px');
    for(const sample of samples) {
      const node=document.createElement('section');node.className='kit-sample';
      node.innerHTML='<h3>'+escape(sample.kit.title)+'</h3><p>'+escape(sample.kit.description||'')+'</p><div class="kit-example-inventory" aria-label="'+escape(sample.kit.title)+' inventory"></div><div class="sample-actions"><button type="button" data-icon="copy">Copy kit JSON</button><a data-icon="external-link" href="kit-editor.html?kit='+encodeURIComponent(JSON.stringify(sample.kit))+'">Edit kit</a></div>';
      const view=new HeritageInventory.Inventory(node.querySelector('.kit-example-inventory'),{scaleWidth:width,onControl:control=>{
        const options={...view.options};if(control.kind==='cosmetics')options.cosmetics=!options.cosmetics;else options.offset=control.value;view.set(sample.kit,options);
      }});
      view.set(sample.kit,sample.options);kitViews.push(view);
      const button=node.querySelector('.sample-actions button');button.addEventListener('click',()=>copy(JSON.stringify(sample.kit,null,2),button));host.append(node);
    }
    icons(host);

  }catch(error){if(anchor.isConnected)host.textContent=error.message;}
}
function packTabs() {
  const article=$('article'),headings=[...article.querySelectorAll('h2')],host=document.createElement('div'),tabs=document.createElement('div');
  host.className='pack-examples';tabs.className='pack-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Example packs');host.append(tabs);headings[0].before(host);
  for(const [index,heading] of headings.entries()) {
    const panel=document.createElement('section'),button=document.createElement('button');
    panel.id=heading.id;heading.removeAttribute('id');panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-'+panel.id);panel.tabIndex=0;
    button.id='tab-'+panel.id;button.type='button';button.textContent=heading.textContent;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);tabs.append(button);host.append(panel);
    let node=heading;
    while(node&&node!==headings[index+1]){const next=node.nextSibling;panel.append(node);node=next;}
    for(const code of panel.querySelectorAll('.code-block')) {
      const title=code.previousElementSibling;if(title?.tagName!=='H3'||!title.textContent.match(/^(Start|Kit|Template): /))continue;
      const details=document.createElement('details'),summary=document.createElement('summary');details.className='pack-file';details.id=title.id;summary.textContent=title.textContent;title.replaceWith(details);details.append(summary,code);
    }
    button.addEventListener('click',()=>{if(button.getAttribute('aria-selected')==='true')return;selectPack(panel.id);history.pushState(null,'','#/examples/'+panel.id);});
  }
  tabs.addEventListener('keydown',event=>{
    const buttons=[...tabs.children],index=buttons.indexOf(event.target);if(index<0)return;
    const next=event.key==='ArrowRight'?(index+1)%buttons.length:event.key==='ArrowLeft'?(index+buttons.length-1)%buttons.length:event.key==='Home'?0:event.key==='End'?buttons.length-1:-1;
    if(next<0)return;event.preventDefault();buttons[next].click();buttons[next].focus();
  });
  selectPack('example-datapack');
}
function selectPack(id) {
  const host=$('article').querySelector('.pack-examples');if(!host)return;
  for(const button of host.querySelectorAll('[role="tab"]')){const selected=button.getAttribute('aria-controls')===id;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
  for(const panel of host.querySelectorAll('[role="tabpanel"]'))panel.hidden=panel.id!==id;
  updateToc();
}
function updateToc() {
  const headings=[...$('article').querySelectorAll('h2,h3,details.pack-file')].filter(node=>!node.closest('.sample,.kit-sample,[hidden]'));
  $('toc').innerHTML='<p>On this page</p>'+headings.map(node=>'<a class="'+(node.tagName==='H3'||node.matches('.pack-file')?'subheading':'')+'" href="#/'+current+'/'+(node.id||node.closest('[role="tabpanel"]')?.id)+'">'+escape(node.matches('.pack-file')?node.querySelector('summary').textContent:node.textContent)+'</a>').join('');
}
function examples(page) {
  const list=[];
  if(page==='examples')packTabs();
  if(page==='kits')kitPreviews($('article').querySelector('#kit-previews'));
  if(page==='text-styles') {
    const host=document.createElement('div');
    host.innerHTML='<div class="sample-controls"><input id="filter-styles" type="search" aria-label="Filter text examples" placeholder="Filter styles and tags…"><button type="button" id="pause-samples" aria-pressed="'+HeritageSamples.paused+'">'+(HeritageSamples.paused?'Play animations':'Pause animations')+'</button></div><div id="style-list">'+styles.map((sample,index)=>sampleMarkup(sample,index)).join('')+'</div><h2 id="named-colors">All Minecraft colors</h2><p>Copy a color tag below. Aliases: grey, dark_grey, purple, and magenta.</p><div class="color-samples"></div>';
    const insert=$('article').querySelector('#inline-styling');
    insert.before(host);
    for(const [name,color] of Object.entries(HeritagePreview.colors)) {
      const sample={id:'color-'+name,title:name,text:'<'+name+'>'+name.replaceAll('_',' ')+'</'+name+'>',description:'#'+color.toString(16).padStart(6,'0')};
      host.querySelector('.color-samples').insertAdjacentHTML('beforeend',sampleMarkup(sample,styles.length+list.length));
      list.push(sample);
    }
    list.unshift(...styles);
    host.querySelector('#filter-styles').addEventListener('input',event=>{
      const query=event.target.value.trim().toLowerCase();
      for(const node of host.querySelectorAll('.sample'))node.hidden=!node.textContent.toLowerCase().includes(query);
    });
    host.querySelector('#pause-samples').addEventListener('click',event=>{
      const paused=HeritageSamples.toggle();event.currentTarget.textContent=paused?'Play animations':'Pause animations';event.currentTarget.setAttribute('aria-pressed',String(paused));
    });
  }
  if(page==='intros') {
    const visual=[
      {id:'normal',title:'Normal text',text:'A new journey begins.',description:'Default text size with an outline.'},
      {id:'large',title:'Larger title',text:'A new journey begins.',description:'Main text at 1.5x size.',config:{title:true}},
      {id:'large-subtitle',title:'Larger subtitle',text:'A new journey begins.',description:'Subtitle at 1.5x size, independent of the title.',tall:true,config:{subtitle:'Find your own way.',large_subtitle:true}},
      {id:'custom-coordinates',title:'Custom coordinates',text:'A new beginning.',description:'Independent title and subtitle anchors with custom wrapping widths.',tall:true,config:{subtitle:'Find home.',large_subtitle:true,title_position:'left_center',subtitle_position:'right_center',title_coordinates:{width:35,x:7.1,y:63.1},subtitle_coordinates:{width:38.2,x:56.4,y:71.2}}},
      {id:'no-outline',title:'No outline',text:'A new journey begins.',description:'Text without an outline or shadow.',config:{outline:false}},
      ...['fade_in','word_by_word','letter_by_letter','immediate'].map(animation=>({id:animation,title:({fade_in:'Fade in',word_by_word:'Word by word',letter_by_letter:'Letter by letter',immediate:'Immediate'})[animation],text:'You woke up in <gold><biome></gold>.',description:({fade_in:'Text fades into view.',word_by_word:'Reveal one word at a time.',letter_by_letter:'Reveal one letter at a time.',immediate:'Show all text at once.'})[animation],reveal:true,config:{animation,reveal_ticks:60}})),
      ...Object.keys(HeritagePreview.positions).map(position=>({id:position,title:position,text:'A new journey begins.',description:'Title and subtitle use '+position+'.',tall:true,config:{subtitle:'Find your own way.',title_position:position,subtitle_position:position}})),
      ...['straight','random'].map(style=>({id:'bars-'+style,title:style+' bars',text:'A new journey begins.',description:'Cinematic bars with '+(style==='straight'?'straight':'angled')+' edges.',tall:true,config:{cinematic_bars:true,bar_style:style}}))
    ];
    const host=document.createElement('div');host.innerHTML='<h2 id="visual-options">Visual options</h2><button type="button" id="pause-samples" aria-pressed="'+HeritageSamples.paused+'">'+(HeritageSamples.paused?'Play animations':'Pause animations')+'</button><div class="intro-samples">'+visual.map(sampleMarkup).join('')+'</div>';
    $('article').querySelector('#intro-definitions').before(host);list.push(...visual);
    host.querySelector('#pause-samples').addEventListener('click',event=>{const paused=HeritageSamples.toggle();event.currentTarget.textContent=paused?'Play animations':'Pause animations';event.currentTarget.setAttribute('aria-pressed',String(paused));});
  }
  for(const node of $('article').querySelectorAll('[data-sample-index]')) {
    const sample=list[Number(node.dataset.sampleIndex)];
    node.querySelector('.copy-text').addEventListener('click',()=>copy(sample.text,node.querySelector('.copy-text')));
    node.querySelector('.copy-intro').addEventListener('click',()=>copy(JSON.stringify({text:sample.text,...sample.config},null,2),node.querySelector('.copy-intro')));
  }
  HeritageSamples.mount([...$('article').querySelectorAll('[data-sample-index]')].map(node=>({...list[Number(node.dataset.sampleIndex)],canvas:node.querySelector('canvas')}))).catch(error=>{$('status').textContent='Text previews could not load: '+error.message;});
}
async function copy(text,button) {
  try {
    await navigator.clipboard.writeText(text);
    $('status').textContent='';HeritageIcons.copied(button);
  } catch {
    const field=document.createElement('textarea');field.value=text;field.setAttribute('aria-label','Copy this text');button.after(field);field.focus();field.select();
    $('status').textContent='Clipboard access is unavailable. Copy the selected text with Ctrl+C.';
  }
}
function renderSearch(query) {
  clearKits();document.title='Search documentation · Heritage';
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results=terms.length?pages.filter(page=>terms.every(term=>(page.title+' '+page.description+' '+page.markdown+(page.id==='text-styles'?JSON.stringify(styles):'')).toLowerCase().includes(term))):[];
  $('article').innerHTML='<h1>Search documentation</h1><p class="lead">'+(terms.length?results.length+' matching pages':'Type a field name, command, or style tag.')+'</p>'+results.map(page=>'<a class="search-result" href="#/'+page.id+'"><strong>'+escape(page.title)+'</strong><p>'+escape(page.description)+'</p></a>').join('')+(terms.length&&!results.length?'<p>No matches. Try a shorter field name or a term such as biome, outline, or kit.</p>':'');
  $('toc').replaceChildren();nav(null);HeritageSamples.mount([]);
}
function scrollPage(event) {
  if(event.ctrlKey||!event.deltaY)return;
  const main=$('main'),unit=event.deltaMode===1?parseFloat(getComputedStyle(main).lineHeight):event.deltaMode===2?main.clientHeight:1;
  event.preventDefault();main.scrollBy({top:event.deltaY*unit,left:event.deltaX*unit});
}
function route() {
  const [path,query='']=location.hash.replace(/^#\/?/,'').split('?'),[id='getting-started',section]=path.split('/');
  if(id==='search'){current='search';$('search').value=new URLSearchParams(query).get('q')||'';renderSearch($('search').value);return;}
  const page=pages.find(item=>item.id===id)||pages[0];
  if(current!==page.id) {
    clearKits();current=page.id;$('search').value='';document.title=page.title+' · Heritage';
    const rendered=markdown(page.markdown);
    $('article').innerHTML='<h1>'+escape(page.title)+'</h1><p class="lead">'+escape(page.description)+'</p>'+rendered.html;
    examples(page.id);
    for(const node of $('article').querySelectorAll('code[data-language="json"]'))highlight(node);
    for(const code of $('article').querySelectorAll('td code'))if(code.textContent.startsWith('/')) {
      const button=document.createElement('button');button.type='button';button.className='copy-command';button.setAttribute('aria-label','Copy '+code.textContent);button.append(HeritageIcons.create('copy'));button.addEventListener('click',()=>copy(code.textContent,button));code.after(button);
    }
    for(const button of $('article').querySelectorAll('.copy-code'))button.addEventListener('click',()=>copy(button.closest('.code-block').querySelector('code').textContent,button));
    const index=pages.indexOf(page);
    $('article').insertAdjacentHTML('beforeend','<footer class="page-footer">'+(index?'<a href="#/'+pages[index-1].id+'"><small>Previous</small>'+escape(pages[index-1].title)+'</a>':'<span></span>')+(index<pages.length-1?'<a href="#/'+pages[index+1].id+'"><small>Next</small>'+escape(pages[index+1].title)+'</a>':'')+'</footer>');
    icons($('article'));nav(page.id);
    updateToc();
    $('main').scrollTo(0,0);
  }
  if(section){
    const target=document.getElementById(section),panel=target?.closest('[role="tabpanel"]');
    if(panel)selectPack(panel.id);
    if(target?.matches('details.pack-file'))target.open=true;
    (panel&&target===panel?panel.closest('.pack-examples'):target)?.scrollIntoView();
  } else if(page.id==='examples')selectPack('example-datapack');
  $('article').focus({preventScroll:true});
  document.querySelector('.sidebar').classList.remove('open');$('menu').setAttribute('aria-expanded','false');
}
function search() {
  const hash='#/search?'+new URLSearchParams({q:$('search').value});
  if(current==='search')history.replaceState(null,'',hash);else history.pushState(null,'',hash);
  current='search';renderSearch($('search').value);
}

document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('article').focus();});
for(const node of [$('toc'),document.querySelector('header'),document.querySelector('.site-footer')])node.addEventListener('wheel',scrollPage,{passive:false});
$('menu').addEventListener('click',()=>{const open=document.querySelector('.sidebar').classList.toggle('open');$('menu').setAttribute('aria-expanded',String(open));});
$('search').addEventListener('input',search);
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('search').focus();$('search').select();}
  if(event.key==='Escape'&&document.activeElement===$('search')){$('search').value='';location.hash='#/getting-started';}
});
window.addEventListener('hashchange',route);
window.addEventListener('popstate',route);
icons();route();
})();
