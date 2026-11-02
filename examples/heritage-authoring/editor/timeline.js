(() => {
'use strict';
const P=typeof module!=='undefined'?require('./engine.js'):HeritagePreview;
const timingKeys=['black_hold_ticks','fade_from_black_ticks','reveal_ticks','hold_ticks','fade_out_ticks','bar_transition_ticks'];
const seconds=ticks=>(ticks/20).toFixed(2).replace(/0$/,'').replace(/\.0$/,'')+' s';
function layout(config){
  const start=config.black_hold_ticks,presentation=P.presentation(config),total=P.duration(config),reveal=config.animation==='immediate'?0:config.reveal_ticks,bar=Math.min(config.bar_transition_ticks,presentation/2),extended=config.fade_from_black_ticks>reveal+config.hold_ticks+config.fade_out_ticks;
  const segment=(id,label,from,to,key=null,disabled=false,sign=1,value=key?config[key]:0)=>({id,label,from,to,key,disabled,sign,value});
  return {total,start,extended,tracks:[
    {label:'World',segments:[segment('black','Black',0,start,'black_hold_ticks'),segment('world','Fade in',start,start+config.fade_from_black_ticks,'fade_from_black_ticks')]},
    {label:'Text',segments:[segment('reveal',config.animation==='immediate'?'Immediate':'Reveal',start,start+reveal,'reveal_ticks',config.animation==='immediate'),segment('hold','Hold',start+reveal,total-config.fade_out_ticks,'hold_ticks',extended),segment('text-fade','Fade out',total-config.fade_out_ticks,total,'fade_out_ticks',extended)]},
    {label:'Bars',disabled:!config.cinematic_bars,segments:[segment('bar-in','Enter',start,start+bar,'bar_transition_ticks',!config.cinematic_bars,1,bar),segment('bar-hold',config.cinematic_bars?'Hold':'Disabled',start+bar,total-bar),segment('bar-out','Exit',total-bar,total,'bar_transition_ticks',!config.cinematic_bars,-1,bar)]}
  ]};
}
function create(host,config){
  const root=document.createElement('section');root.className='intro-track-editor';root.setAttribute('aria-label','Intro timing tracks');
  const heading=document.createElement('div'),title=document.createElement('h3'),duration=document.createElement('output');heading.className='timeline-heading';title.textContent='Timeline';
  const zoomLabel=document.createElement('label'),zoomSelect=document.createElement('select');zoomLabel.className='timeline-zoom';zoomLabel.append('Zoom',zoomSelect);zoomSelect.setAttribute('aria-label','Timeline zoom');
  for(const value of [1,2,4,8]){const option=document.createElement('option');option.value=value;option.textContent=value===1?'Fit':value+'×';zoomSelect.append(option);}heading.append(title,duration,zoomLabel);
  const ruler=document.createElement('div');ruler.className='timeline-ruler';ruler.setAttribute('aria-hidden','true');
  const rows=document.createElement('div');rows.className='timeline-rows';
  const viewport=document.createElement('div'),content=document.createElement('div');viewport.className='timeline-scroll';content.className='timeline-content';content.append(ruler,rows);viewport.append(content);
  const status=document.createElement('p');status.className='hint timeline-status';status.setAttribute('role','status');root.append(heading,viewport,status);host.append(root);
  const controls=new Map(),lanes=[];let drag=null,model,zoom=1;
  for(const track of layout(config.get()).tracks){
    const row=document.createElement('div'),label=document.createElement('span'),lane=document.createElement('div'),cursor=document.createElement('div');row.className='timeline-row';label.textContent=track.label;lane.className='timeline-lane';cursor.className='timeline-cursor';cursor.setAttribute('aria-hidden','true');
    for(const segment of track.segments){
      const block=document.createElement('div'),text=document.createElement('span');block.className='timeline-segment';block.dataset.segment=segment.id;block.append(text);lane.append(block);
      let handle;if(segment.key){handle=document.createElement('button');handle.type='button';handle.className='timeline-handle';handle.dataset.timingHandle=segment.id;handle.setAttribute('role','slider');handle.setAttribute('aria-label',track.label+' '+segment.label.toLowerCase()+' duration');lane.append(handle);}
      controls.set(segment.id,{block,text,handle});
    }
    const off=document.createElement('span');off.className='timeline-off';off.textContent='Cinematic bars off';off.hidden=true;lane.append(off,cursor);row.append(label,lane);rows.append(row);lanes.push({lane,cursor,off});
    lane.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const rect=lane.getBoundingClientRect();config.seek(P.clamp((event.clientX-rect.left)/rect.width)*model.total);});
  }
  function fitLabels(){
    for(const {block,text,labels} of controls.values())if(labels&&!block.hidden){
      text.textContent=labels[0];
      for(const label of labels.slice(1))if(text.scrollWidth>text.clientWidth)text.textContent=label;
    }
  }
  function scale(){
    content.style.width='calc('+zoom*100+'% - '+(zoom-1)*64+'px)';
    ruler.replaceChildren(...Array.from({length:zoom*4+1},(_,index)=>{const position=index/(zoom*4),label=document.createElement('span');label.textContent=seconds(Math.round(model.total*position));label.style.left=position*100+'%';return label;}));
    fitLabels();
  }
  zoomSelect.addEventListener('change',()=>{
    finish(true);const width=viewport.clientWidth-64,center=(viewport.scrollLeft+width/2)/(width*zoom);zoom=Number(zoomSelect.value);scale();viewport.scrollLeft=center*width*zoom-width/2;
  });
  const resize=new ResizeObserver(fitLabels);resize.observe(content);
  function update(time=0,valid=true){
    model=layout(config.get());duration.textContent=seconds(model.total)+' · '+model.total+' ticks';
    for(const [index,track] of model.tracks.entries()){
      lanes[index].lane.classList.toggle('disabled-track',!!track.disabled);lanes[index].off.hidden=!track.disabled;
      for(const segment of track.segments){
        const control=controls.get(segment.id),{block,text,handle}=control;block.hidden=!!track.disabled||segment.to===segment.from;control.labels=[segment.label+' '+seconds(segment.to-segment.from),segment.label,seconds(segment.to-segment.from),''];block.style.left=segment.from/model.total*100+'%';block.style.width=Math.max(0,(segment.to-segment.from)/model.total*100)+'%';text.textContent=segment.label+' '+seconds(segment.to-segment.from);block.title=track.label+': '+segment.label+' '+seconds(segment.to-segment.from)+' ('+(segment.to-segment.from)+' ticks), from '+seconds(segment.from)+' to '+seconds(segment.to);block.setAttribute('aria-label',block.title);
        if(handle){
          handle.hidden=!!track.disabled||segment.key==='reveal_ticks'&&segment.disabled;
          const maximum=segment.key==='bar_transition_ticks'?Math.min(1200,Math.floor(P.presentation(config.get())/2)):1200;
          handle.style.left='clamp(8px,'+(segment.sign<0?segment.from:segment.to)/model.total*100+'%,calc(100% - 8px))';handle.disabled=!valid||segment.disabled;handle.dataset.key=segment.key;handle.dataset.sign=segment.sign;handle.dataset.value=segment.value;handle.dataset.maximum=maximum;handle.setAttribute('aria-valuemin',segment.key==='black_hold_ticks'?'0':'1');handle.setAttribute('aria-valuemax',String(maximum));handle.setAttribute('aria-valuenow',String(Math.min(maximum,segment.value)));handle.setAttribute('aria-valuetext',seconds(segment.value)+' ('+segment.value+' ticks)');handle.title=handle.getAttribute('aria-label')+': '+seconds(segment.value)+'. Drag, or use arrow keys. Shift changes one second.';
        }
      }
    }
    status.textContent=model.extended?'World fade extends the text hold. Shorten World fade before dragging the hold or fade boundary.':config.get().cinematic_bars&&config.get().bar_transition_ticks>P.presentation(config.get())/2?'Bar movement is capped at half the visible intro.':'Drag a boundary to change its duration. Click a track to scrub. Zoom in for short segments.';
    scale();tick(time);
  }
  function tick(time){for(const {cursor} of lanes)cursor.style.left=P.clamp(time/model.total)*100+'%';}
  function change(handle,value,commit){const minimum=Number(handle.getAttribute('aria-valuemin')),maximum=Number(handle.dataset.maximum),next=Math.round(P.clamp(value,minimum,maximum));config.change(handle.dataset.key,next,commit);}
  function finish(cancel=false){
    if(!drag)return;const current=drag;drag=null;
    if(cancel)config.cancel(current.original);else config.commit(current.handle.dataset.key);
    if(current.handle.hasPointerCapture(current.pointer))current.handle.releasePointerCapture(current.pointer);
  }
  rows.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-timing-handle]');if(!handle||handle.disabled)return;event.preventDefault();
    drag={handle,pointer:event.pointerId,start:event.clientX,value:Number(handle.dataset.value),scale:model.total/handle.parentElement.getBoundingClientRect().width,original:Object.fromEntries(timingKeys.map(key=>[key,config.get()[key]]))};handle.setPointerCapture(event.pointerId);handle.focus();
  });
  rows.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;change(drag.handle,drag.value+(event.clientX-drag.start)*drag.scale*Number(drag.handle.dataset.sign),false);});
  rows.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finish();});rows.addEventListener('pointercancel',()=>finish(true));rows.addEventListener('lostpointercapture',()=>finish());
  rows.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();finish(true);return;}
    const handle=event.target.closest('[data-timing-handle]');if(!handle||handle.disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();
    const value=Number(handle.dataset.value),step=event.shiftKey?20:1;change(handle,event.key==='Home'?Number(handle.getAttribute('aria-valuemin')):event.key==='End'?Number(handle.dataset.maximum):value+(['ArrowLeft','ArrowDown'].includes(event.key)?-step:step),true);
  });
  update();return {update,tick,cancel:()=>finish(true),element:root};
}
const api={layout,create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageTimeline=api;
})();
