(() => {
'use strict';
const P=HeritagePicture,$=id=>document.getElementById(id),dialog=$('picture-editor'),canvas=$('picture-crop-preview'),sourceCanvas=$('picture-source-preview'),fields=['x','y','zoom'];
let session,request=0,drag=null;
const buffer=document.createElement('canvas');
function pixels(image,crop,keepResolution=false){
  const size=P.dimensions(image.naturalWidth,image.naturalHeight,crop,keepResolution);buffer.width=size.width;buffer.height=size.height;const context=buffer.getContext('2d');if(!context)throw new Error('Image processing is unavailable in this browser.');const region=P.rect(image.naturalWidth,image.naturalHeight,crop);context.imageSmoothingQuality='high';context.drawImage(image,region.x,region.y,region.width,region.height,0,0,size.width,size.height);const data=buffer.toDataURL('image/png');if(!data.startsWith('data:image/png;')||data.length>(keepResolution?24*1024*1024:150000))throw new Error('The cropped PNG is too large. Choose a smaller image or turn off Keep source resolution.');return data;
}
function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(file.type?reader.result:reader.result.replace(/^data:[^;,]*;base64,/,()=> 'data:image/'+(/\.png$/i.test(file.name)?'png':/\.webp$/i.test(file.name)?'webp':'jpeg')+';base64,'));reader.onerror=()=>reject(new Error('The source image could not be read. Choose the image again.'));reader.readAsDataURL(file);});}
async function imageSource(picture){
  const source=P.source(picture),image=new Image();image.src=source.data;await image.decode();
  if(image.naturalWidth!==source.width||image.naturalHeight!==source.height)throw new Error('The saved image dimensions do not match its source. Choose the image again.');
  return {source,image};
}
async function resolution(picture,keepResolution){
  const {source,image}=await imageSource(picture);return {...picture,keepResolution,data:pixels(image,source.crop,keepResolution)};
}
async function prepare(image,{keepResolution=false,file}={}){
  if(keepResolution){P.dimensions(image.naturalWidth,image.naturalHeight,P.defaults(),true);const source={data:await fileData(file),width:image.naturalWidth,height:image.naturalHeight,preserved:true};P.source({source,crop:P.defaults()});return {data:pixels(image,P.defaults(),true),source,crop:P.defaults(),keepResolution:true};}
  const source=document.createElement('canvas');let edge=1536;
  for(let attempt=0;attempt<7;attempt++){
    const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));source.width=Math.max(1,Math.round(image.naturalWidth*scale));source.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=source.getContext('2d');if(!context)throw new Error('Image processing is unavailable in this browser.');context.imageSmoothingQuality='high';context.drawImage(image,0,0,source.width,source.height);const data=source.toDataURL('image/webp',.9);
    if(data.length<=450000){const decoded=new Image();decoded.src=data;await decoded.decode();return {data:pixels(decoded,P.defaults()),source:{data,width:source.width,height:source.height},crop:P.defaults()};}edge=Math.max(256,Math.floor(edge*.75));
  }
  throw new Error('This image could not be saved at a usable size. Choose a smaller image.');
}
function showError(error){if(session)session.error=error.message;$('crop-apply').disabled=true;$('picture-crop-error').textContent=error.message;$('picture-crop-error').hidden=false;}
function drawOverview(){
  if(!session||!dialog.open)return;const box=sourceCanvas.getBoundingClientRect();if(!box.width||!box.height)return;const ratio=devicePixelRatio||1;sourceCanvas.width=Math.round(box.width*ratio);sourceCanvas.height=Math.round(box.height*ratio);const context=sourceCanvas.getContext('2d'),view=P.overview(session.image.naturalWidth,session.image.naturalHeight,session.crop,box.width-16,box.height-16),image={...view.image,x:view.image.x+8,y:view.image.y+8},window={...view.window,x:view.window.x+8,y:view.window.y+8};session.overview={...view,image,window};context.scale(ratio,ratio);context.fillStyle='#0b0b0b';context.fillRect(0,0,box.width,box.height);context.drawImage(session.image,image.x,image.y,image.width,image.height);
  context.fillStyle='#0009';context.fillRect(image.x,image.y,image.width,window.y-image.y);context.fillRect(image.x,window.y+window.height,image.width,image.y+image.height-window.y-window.height);context.fillRect(image.x,window.y,window.x-image.x,window.height);context.fillRect(window.x+window.width,window.y,image.x+image.width-window.x-window.width,window.height);
  context.strokeStyle='#111';context.lineWidth=3;context.strokeRect(window.x,window.y,window.width,window.height);context.strokeStyle='#fff';context.lineWidth=1;context.strokeRect(window.x,window.y,window.width,window.height);
  if($('crop-guides').checked){context.strokeStyle='#ffffff80';context.beginPath();for(const fraction of [1/3,2/3]){context.moveTo(window.x+window.width*fraction,window.y);context.lineTo(window.x+window.width*fraction,window.y+window.height);context.moveTo(window.x,window.y+window.height*fraction);context.lineTo(window.x+window.width,window.y+window.height*fraction);}context.stroke();}
  const region=P.rect(session.image.naturalWidth,session.image.naturalHeight,session.crop);$('picture-source-summary').textContent=Math.round(region.width)+' × '+Math.round(region.height)+' crop from '+session.image.naturalWidth+' × '+session.image.naturalHeight+' source';
}
function draw(){
  if(!session)return;session.error='';$('crop-apply').disabled=false;$('picture-crop-legacy').hidden=!session.keepResolution||session.source.preserved===true;try{session.data=pixels(session.image,session.crop,session.keepResolution);const size=P.dimensions(session.image.naturalWidth,session.image.naturalHeight,session.crop,session.keepResolution);$('picture-output-size').textContent=size.width+' × '+size.height+' PNG';drawOverview();for(const key of fields){$('crop-'+key).value=String(session.crop[key]);$('crop-'+key+'-value').value=String(Math.round(session.crop[key]*100)/100);}HeritageFlowPreview.cardPreview(canvas,session.spawn,session.data).catch(showError);$('picture-crop-error').hidden=true;}catch(error){showError(error);}
}
async function open({picture,spawn,apply}){
  const token=++request;
  try{
    const {source,image}=await imageSource(picture);if(token!==request)return;
    session={picture,spawn,apply,image,source:{data:source.data,width:source.width,height:source.height,...(source.preserved?{preserved:true}:{})},crop:source.crop,keepResolution:picture.keepResolution===true};$('picture-crop-heading').textContent='Crop '+(HeritageFlow.label(spawn,'title')||'card image');$('crop-keep-resolution').checked=session.keepResolution;$('picture-crop-legacy').hidden=source.preserved===true;dialog.showModal();draw();canvas.focus();
  }catch(error){$('picture-status').textContent=error.message;$('picture-status').classList.add('error');}
}
for(const key of fields)for(const suffix of ['','-value'])$('crop-'+key+suffix).addEventListener('input',event=>{if(!session)return;const value=Number(event.target.value);try{if(event.target.value==='')throw new Error('Enter a crop value.');session.crop=P.crop({...session.crop,[key]:value});draw();}catch(error){showError(error);}});
$('crop-reset').addEventListener('click',()=>{if(session){session.crop=P.defaults();draw();}});
$('crop-apply').addEventListener('click',()=>{if(!session)return;try{if(session.error)throw new Error(session.error);for(const key of fields){const field=$('crop-'+key+'-value');if(!field.checkValidity()||field.value==='')throw new Error('Enter valid crop values before applying.');}const picture={...session.picture,data:session.data,source:session.source,crop:P.crop(session.crop),keepResolution:session.keepResolution};HeritagePack.pictureBytes(picture);if(session.apply(picture)===false)throw new Error('This image could not be updated. Resolve the save issue and try again.');dialog.close();}catch(error){showError(error);}});
$('crop-cancel').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{session=null;drag=null;request++;});
dialog.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))event.stopPropagation();});
canvas.addEventListener('pointerdown',event=>{if(!session||event.button!==0)return;drag={kind:'card',x:event.clientX,y:event.clientY,crop:{...session.crop}};canvas.setPointerCapture(event.pointerId);canvas.focus();event.preventDefault();});
canvas.addEventListener('pointermove',event=>{if(drag?.kind!=='card'||!session)return;const box=canvas.getBoundingClientRect();session.crop=P.pan(session.image.naturalWidth,session.image.naturalHeight,drag.crop,event.clientX-drag.x,event.clientY-drag.y,box.width*120/128,box.height*184/192);draw();});
for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>{drag=null;});
canvas.addEventListener('wheel',event=>{if(!session)return;event.preventDefault();session.crop.zoom=Math.max(1,Math.min(8,session.crop.zoom*(event.deltaY<0?1.05:1/1.05)));draw();},{passive:false});
function moveByKey(event){if(!session||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const delta=event.shiftKey?10:1,key=event.key==='ArrowLeft'||event.key==='ArrowRight'?'x':'y';session.crop[key]=Math.max(0,Math.min(100,session.crop[key]+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-delta:delta)));draw();}
canvas.addEventListener('keydown',moveByKey);sourceCanvas.addEventListener('keydown',moveByKey);
sourceCanvas.addEventListener('pointerdown',event=>{
  if(!session||event.button!==0||!session.overview)return;const box=sourceCanvas.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top,{image,window,scale}=session.overview;if(x<image.x||x>image.x+image.width||y<image.y||y>image.y+image.height)return;
  if(x<window.x||x>window.x+window.width||y<window.y||y>window.y+window.height)session.crop=P.place(session.image.naturalWidth,session.image.naturalHeight,session.crop,(x-image.x)/scale,(y-image.y)/scale);
  drag={kind:'source',x:event.clientX,y:event.clientY,crop:{...session.crop},scale};sourceCanvas.setPointerCapture(event.pointerId);sourceCanvas.focus();event.preventDefault();draw();
});
sourceCanvas.addEventListener('pointermove',event=>{if(drag?.kind!=='source'||!session)return;const region=P.rect(session.image.naturalWidth,session.image.naturalHeight,drag.crop);session.crop=P.place(session.image.naturalWidth,session.image.naturalHeight,drag.crop,region.x+region.width/2+(event.clientX-drag.x)/drag.scale,region.y+region.height/2+(event.clientY-drag.y)/drag.scale);draw();});
for(const node of [canvas,sourceCanvas])for(const type of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(type,()=>{drag=null;});
$('crop-keep-resolution').addEventListener('change',event=>{if(session){session.keepResolution=event.target.checked;draw();}});
$('crop-guides').addEventListener('change',drawOverview);new ResizeObserver(drawOverview).observe(sourceCanvas);

globalThis.HeritagePictureEditor={prepare,resolution,open};
})();
