(() => {
'use strict';
const key='heritage.kitWorkspace.v1',minimum=[320,300,200],gap=16;
function minimums(available){
  const scale=Math.min(1,available/minimum.reduce((sum,value)=>sum+value,0));
  return minimum.map(value=>value*scale);
}
function fit(weights,width){
  const available=Math.max(0,width-gap*2),limits=minimums(available),result=[0,0,0];
  let remaining=available,active=[0,1,2];
  while(active.length){
    const total=active.reduce((sum,index)=>sum+weights[index],0);
    const constrained=active.filter(index=>remaining*weights[index]/total<limits[index]);
    if(!constrained.length){for(const index of active)result[index]=remaining*weights[index]/total;break;}
    for(const index of constrained){result[index]=limits[index];remaining-=limits[index];}
    active=active.filter(index=>!constrained.includes(index));
  }
  return result;
}
function defaults(width){
  const controls=Math.max(340,Math.min(580,width*.32)),catalog=Math.max(220,Math.min(320,width*.2));
  return fit([Math.max(1,width-gap*2-controls-catalog),controls,catalog],width);
}
function move(widths,index,delta){
  const result=[...widths],total=widths[index]+widths[index+1],limits=minimums(widths.reduce((sum,value)=>sum+value,0));
  result[index]=Math.max(limits[index],Math.min(total-limits[index+1],widths[index]+delta));
  result[index+1]=total-result[index];
  return result;
}
function create(report){
  const workspace=document.querySelector('.kit-workspace'),desktop=matchMedia('(min-width:900px)');
  let weights=null,widths=[],drag=null;
  try{
    const saved=JSON.parse(localStorage.getItem(key)??'null');
    if(saved!==null){
      if(!Array.isArray(saved)||saved.length!==3||!saved.every(value=>Number.isFinite(value)&&value>0))throw new Error('Invalid column widths');
      weights=saved;
    }
  }catch(error){report('Column widths could not load: '+error.message);}
  const handles=['Inventory and controls divider','Controls and item catalog divider'].map((name,index)=>{
    const handle=document.createElement('div');handle.className='kit-column-divider';handle.dataset.divider=String(index);handle.tabIndex=0;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',name);
    handle.title='Drag to resize. Use arrow keys for small adjustments. Double-click to reset widths.';
    workspace.append(handle);return handle;
  });
  function draw(){
    workspace.style.setProperty('--kit-columns',widths.map(value=>value+'px').join(' '+gap+'px '));
    const limits=minimums(widths.reduce((sum,value)=>sum+value,0));
    for(const [index,handle] of handles.entries()){
      handle.setAttribute('aria-valuemin',Math.round(limits[index]));handle.setAttribute('aria-valuemax',Math.round(widths[index]+widths[index+1]-limits[index+1]));
      handle.setAttribute('aria-valuenow',Math.round(widths[index]));handle.setAttribute('aria-valuetext',Math.round(widths[index])+' pixels');
    }
  }
  function layout(){
    if(!desktop.matches||workspace.clientWidth===0||!['details','inventory','shop','review'].includes(document.body.dataset.authorStage))return;
    widths=weights?fit(weights,workspace.clientWidth):defaults(workspace.clientWidth);draw();
  }
  function save(){
    weights=[...widths];
    try{localStorage.setItem(key,JSON.stringify(weights));}catch(error){report('Column widths could not save: '+error.message);}
  }
  function finish(cancel=false){
    if(!drag)return;
    const previous=drag;drag=null;
    if(cancel){widths=previous.widths;draw();}else save();
    document.body.classList.remove('kit-resizing');
    if(previous.handle.hasPointerCapture(previous.pointer))previous.handle.releasePointerCapture(previous.pointer);
  }
  for(const [index,handle] of handles.entries()){
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||!desktop.matches)return;
      event.preventDefault();handle.focus({preventScroll:true});
      drag={handle,index,pointer:event.pointerId,x:event.clientX,widths:[...widths]};handle.setPointerCapture(event.pointerId);document.body.classList.add('kit-resizing');
    });
    handle.addEventListener('pointermove',event=>{
      if(drag?.handle!==handle||drag.pointer!==event.pointerId)return;
      widths=move(drag.widths,index,event.clientX-drag.x);draw();
    });
    handle.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finish();});
    handle.addEventListener('pointercancel',()=>finish(true));handle.addEventListener('lostpointercapture',()=>finish(true));
    handle.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(true);return;}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const delta=event.key==='Home'?-Infinity:event.key==='End'?Infinity:(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?40:10);
      widths=move(widths,index,delta);draw();save();
    });
    handle.addEventListener('dblclick',()=>{
      finish(true);weights=null;layout();
      try{localStorage.removeItem(key);}catch(error){report('Column widths could not reset: '+error.message);}
    });
  }
  new ResizeObserver(layout).observe(workspace);desktop.addEventListener('change',layout);
  new MutationObserver(layout).observe(document.body,{attributes:true,attributeFilter:['data-author-stage']});
  window.addEventListener('blur',()=>finish(true));layout();
}
const api={defaults,fit,move,create};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageKitWorkspace=api;
})();
