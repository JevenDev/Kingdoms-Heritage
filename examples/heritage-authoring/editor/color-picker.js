(() => {
'use strict';
const dialog=document.createElement('dialog');
dialog.id='color-picker';dialog.className='color-picker';dialog.setAttribute('aria-labelledby','color-picker-title');
dialog.innerHTML=`<div class="color-picker-heading"><h2 id="color-picker-title">Color</h2><span class="color-picker-preview" aria-hidden="true"></span></div>
<div class="color-picker-area">
  <span class="color-picker-marker" aria-hidden="true"></span>
  <input class="sr-only" data-picker="saturation" type="range" min="0" max="100" step="1" aria-label="Saturation" autofocus>
  <input class="sr-only" data-picker="brightness" type="range" min="0" max="100" step="1" aria-label="Brightness">
</div>
<input class="color-picker-hue" data-picker="hue" type="range" min="0" max="360" step="1" aria-label="Hue">
<div class="color-picker-fields">
  <label>Hex<input data-picker="hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex color"></label>
  <label>R<input data-picker="red" type="number" min="0" max="255" step="1" aria-label="Red"></label>
  <label>G<input data-picker="green" type="number" min="0" max="255" step="1" aria-label="Green"></label>
  <label>B<input data-picker="blue" type="number" min="0" max="255" step="1" aria-label="Blue"></label>
</div>
<p class="color-picker-error" role="status" hidden></p>
<div class="color-picker-actions"><button data-picker="eyedropper" type="button" hidden>Eyedropper</button><button data-picker="cancel" type="button">Cancel</button><button data-picker="done" type="button">Done</button></div>`;
document.body.append(dialog);
const field=name=>dialog.querySelector('[data-picker="'+name+'"]');
const area=dialog.querySelector('.color-picker-area'),marker=dialog.querySelector('.color-picker-marker');
const sample=dialog.querySelector('.color-picker-preview'),error=dialog.querySelector('.color-picker-error');
const channels=['red','green','blue'].map(field);
let target=null,original='',hue=0,saturation=0,brightness=0;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
function readColor(value) {
  const rgb=value.slice(1).match(/../g).map(channel=>parseInt(channel,16)/255);
  const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
  if(delta) {
    const index=rgb.indexOf(max);
    hue=((index===0?(rgb[1]-rgb[2])/delta:index===1?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4)*60+360)%360;
  }
  saturation=max?delta/max:0;brightness=max;
}
function rgbColor() {
  const chroma=brightness*saturation,x=chroma*(1-Math.abs((hue/60)%2-1)),m=brightness-chroma;
  const sector=Math.floor(hue/60)%6;
  return [[chroma,x,0],[x,chroma,0],[0,chroma,x],[0,x,chroma],[x,0,chroma],[chroma,0,x]][sector].map(value=>Math.round((value+m)*255));
}
function sync(source=null) {
  const rgb=rgbColor(),value='#'+rgb.map(channel=>channel.toString(16).padStart(2,'0')).join('');
  dialog.style.setProperty('--picker-hue',hue);
  marker.style.left=saturation*100+'%';marker.style.top=(1-brightness)*100+'%';sample.style.background=value;
  for(const [name,fieldValue] of [['hue',hue],['saturation',Math.round(saturation*100)],['brightness',Math.round(brightness*100)],['hex',value.toUpperCase()]])if(field(name)!==source)field(name).value=fieldValue;
  channels.forEach((input,index)=>{if(input!==source)input.value=rgb[index];});
  for(const input of [field('hex'),...channels])if(input!==source)input.removeAttribute('aria-invalid');
  return value;
}
function publish(source) {
  const value=sync(source);
  if(target&&target.value!==value){target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));}
}
function position() {
  if(!dialog.open||!target)return;
  const viewport=window.visualViewport,viewportWidth=viewport?.width??innerWidth,viewportHeight=viewport?.height??innerHeight;
  const minLeft=(viewport?.offsetLeft??0)+12,minTop=(viewport?.offsetTop??0)+12;
  dialog.style.maxHeight=Math.max(0,viewportHeight-24)+'px';dialog.style.maxWidth=Math.max(0,viewportWidth-24)+'px';
  const anchor=target.getBoundingClientRect(),width=dialog.offsetWidth,height=dialog.offsetHeight;
  const maxLeft=Math.max(minLeft,minLeft+viewportWidth-width-24),maxTop=Math.max(minTop,minTop+viewportHeight-height-24);
  const top=anchor.bottom+8<=maxTop?anchor.bottom+8:anchor.top-height-8;
  dialog.style.left=clamp(anchor.left,minLeft,maxLeft)+'px';dialog.style.top=clamp(top,minTop,maxTop)+'px';
}
function finish(cancel=false) {
  if(!target)return;
  const input=target;target=null;
  if(cancel&&input.value!==original){input.value=original;input.dispatchEvent(new Event('input',{bubbles:true}));}
  if(input.value!==original)input.dispatchEvent(new Event('change',{bubbles:true}));
  input.setAttribute('aria-expanded','false');dialog.close();
  if(input.isConnected)input.focus({preventScroll:true});
}
function enhance(input) {
  input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-controls',dialog.id);
}
function open(input) {
  if(input.disabled||input.readOnly)return;
  enhance(input);target=input;original=input.value;readColor(original);sync();
  dialog.querySelector('h2').textContent=input.getAttribute('aria-label')||input.labels?.[0]?.textContent.trim()||'Color';
  input.setAttribute('aria-expanded','true');error.hidden=true;dialog.showModal();position();
}
function colorInput(event) {return event.target instanceof HTMLInputElement&&event.target.type==='color'?event.target:null;}
document.querySelectorAll('input[type=color]').forEach(enhance);
document.addEventListener('focusin',event=>{const input=colorInput(event);if(input)enhance(input);});
document.addEventListener('click',event=>{const input=colorInput(event);if(input){event.preventDefault();open(input);}},true);
document.addEventListener('keydown',event=>{
  const input=colorInput(event);
  if(input&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open(input);}
});
function moveColor(event) {
  const bounds=area.getBoundingClientRect();
  saturation=clamp((event.clientX-bounds.left)/bounds.width);brightness=1-clamp((event.clientY-bounds.top)/bounds.height);publish();
}
area.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();field('saturation').focus({preventScroll:true});area.setPointerCapture(event.pointerId);moveColor(event);
});
area.addEventListener('pointermove',event=>{if(area.hasPointerCapture(event.pointerId))moveColor(event);});
area.addEventListener('pointerup',event=>{if(area.hasPointerCapture(event.pointerId))area.releasePointerCapture(event.pointerId);});
for(const name of ['hue','saturation','brightness'])field(name).addEventListener('input',event=>{
  const value=Number(event.target.value);
  if(name==='hue')hue=value;else if(name==='saturation')saturation=value/100;else brightness=value/100;
  publish(event.target);
});
field('hex').addEventListener('input',event=>{
  const value=event.target.value.trim().replace(/^#?/,'#'),valid=/^#[0-9a-f]{6}$/i.test(value);
  event.target.setAttribute('aria-invalid',String(!valid));
  if(valid){readColor(value);publish(event.target);}
});
channels.forEach(input=>input.addEventListener('input',event=>{
  const valid=channels.every(channel=>channel.value!==''&&channel.validity.valid);
  input.setAttribute('aria-invalid',String(input.value===''||!input.validity.valid));
  if(valid){readColor('#'+channels.map(channel=>Number(channel.value).toString(16).padStart(2,'0')).join(''));publish(event.target);}
}));
for(const input of [field('hex'),...channels])input.addEventListener('change',()=>sync());
field('cancel').addEventListener('click',()=>finish(true));field('done').addEventListener('click',()=>finish());
dialog.addEventListener('cancel',event=>{event.preventDefault();finish(true);});
dialog.addEventListener('keydown',event=>{if(event.key==='Enter'&&[field('hex'),...channels].includes(event.target)){event.preventDefault();finish();}});
dialog.addEventListener('click',event=>{
  const bounds=dialog.getBoundingClientRect();
  if(event.target===dialog&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))finish();
});
if('EyeDropper' in window) {
  field('eyedropper').hidden=false;
  field('eyedropper').addEventListener('click',async()=>{
    try {const result=await new EyeDropper().open();if(target){readColor(result.sRGBHex);publish();}}
    catch(failure){if(failure.name!=='AbortError'){error.textContent='Could not pick a screen color. Enter a hex or RGB value instead.';error.hidden=false;position();}}
  });
}
document.addEventListener('scroll',position,true);
window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);
})();
