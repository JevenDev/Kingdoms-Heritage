(() => {
'use strict';
const key='heritage.packSidebar.v1',defaultWidth=248;
function bounds(total){
  const max=Math.max(0,Math.min(600,total-20-640));
  return {min:Math.min(200,max),max};
}
function fit(width,total){const {min,max}=bounds(total);return Math.max(min,Math.min(max,width));}
function create(report){
  const sidebar=document.getElementById('pack-content-browser'),workspace=sidebar.parentElement,desktop=matchMedia('(min-width:1200px)');
  let preferred=defaultWidth,width=defaultWidth,drag=null;
  try{
    const saved=JSON.parse(localStorage.getItem(key)??'null');
    if(saved!==null){if(!Number.isFinite(saved)||saved<=0)throw new Error('Invalid sidebar width');preferred=saved;}
  }catch(error){report('Sidebar width could not load: '+error.message);}
  const handle=document.createElement('div');handle.className='pack-sidebar-divider';handle.tabIndex=0;
  handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Pack content and editor divider');handle.setAttribute('aria-controls','pack-content-browser');
  handle.title='Drag to resize. Use arrow keys for small adjustments. Double-click to reset width.';
  sidebar.after(handle);
  function draw(value){
    width=fit(value,workspace.clientWidth);workspace.style.setProperty('--pack-sidebar-width',width+'px');
    const {min,max}=bounds(workspace.clientWidth);
    for(const [name,value] of Object.entries({'aria-valuemin':min,'aria-valuemax':max,'aria-valuenow':width}))handle.setAttribute(name,Math.round(value));
    handle.setAttribute('aria-valuetext',Math.round(width)+' pixels');
  }
  function enabled(){return desktop.matches&&workspace.clientWidth>0&&!document.body.classList.contains('content-browser-collapsed')&&document.body.dataset.workspaceStep==='locations';}
  function layout(){if(!enabled()){finish(true);return;}if(!drag)draw(preferred);}
  function save(){preferred=width;try{localStorage.setItem(key,JSON.stringify(preferred));}catch(error){report('Sidebar width could not save: '+error.message);}}
  function finish(cancel=false){
    if(!drag)return;const previous=drag;drag=null;
    if(cancel)draw(previous.width);else save();
    document.body.classList.remove('pack-sidebar-resizing');
    if(handle.hasPointerCapture(previous.pointer))handle.releasePointerCapture(previous.pointer);
  }
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||!enabled())return;
    event.preventDefault();handle.focus({preventScroll:true});drag={pointer:event.pointerId,x:event.clientX,width};handle.setPointerCapture(event.pointerId);document.body.classList.add('pack-sidebar-resizing');
  });
  handle.addEventListener('pointermove',event=>{if(drag?.pointer===event.pointerId)draw(drag.width+event.clientX-drag.x);});
  handle.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finish();});
  handle.addEventListener('pointercancel',()=>finish(true));handle.addEventListener('lostpointercapture',()=>finish(true));
  handle.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(true);return;}
    if(!enabled()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const delta=event.key==='Home'?-Infinity:event.key==='End'?Infinity:(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?40:10);
    draw(width+delta);save();
  });
  handle.addEventListener('dblclick',()=>{
    finish(true);preferred=defaultWidth;layout();
    try{localStorage.removeItem(key);}catch(error){report('Sidebar width could not reset: '+error.message);}
  });
  new ResizeObserver(layout).observe(workspace);desktop.addEventListener('change',layout);
  new MutationObserver(layout).observe(document.body,{attributes:true,attributeFilter:['class','data-workspace-step']});
  window.addEventListener('blur',()=>finish(true));layout();
}
const api={bounds,fit,create};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritagePackSidebar=api;
})();
