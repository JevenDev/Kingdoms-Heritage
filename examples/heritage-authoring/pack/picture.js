(() => {
'use strict';
const defaults=()=>({x:50,y:50,zoom:1}),clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function crop(value=defaults()){
  if(!value||typeof value!=='object'||!['x','y','zoom'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key]))||value.x<0||value.x>100||value.y<0||value.y>100||value.zoom<1||value.zoom>8)throw new Error('This crop is invalid. Reset it or choose the image again.');
  return {x:value.x,y:value.y,zoom:value.zoom};
}
function rect(width,height,value){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('The image dimensions are invalid.');
  const position=crop(value),scale=Math.max(128/width,192/height)*position.zoom,w=128/scale,h=192/scale;
  return {x:(width-w)*position.x/100,y:(height-h)*position.y/100,width:w,height:h};
}
function dimensions(width,height,value,keepResolution=false){
  const region=rect(width,height,value);
  if(!keepResolution)return {width:128,height:192};
  if(width>8192||height>8192||width*height>16777216)throw new Error('To keep source resolution, choose an image up to 8192 pixels per side and 16 megapixels.');
  return {width:Math.max(1,Math.round(region.width)),height:Math.max(1,Math.round(region.height))};
}
function pan(width,height,value,dx,dy,displayWidth,displayHeight){
  if(![dx,dy,displayWidth,displayHeight].every(Number.isFinite)||displayWidth<=0||displayHeight<=0)throw new Error('The crop movement is invalid.');
  const position=crop(value),window=rect(width,height,position);
  return {...position,x:width>window.width?clamp(position.x-dx/displayWidth*window.width/(width-window.width)*100,0,100):50,y:height>window.height?clamp(position.y-dy/displayHeight*window.height/(height-window.height)*100,0,100):50};
}
function place(width,height,value,x,y){
  if(![x,y].every(Number.isFinite))throw new Error('The crop position is invalid.');const position=crop(value),window=rect(width,height,position);
  return {...position,x:width>window.width?clamp((x-window.width/2)/(width-window.width)*100,0,100):50,y:height>window.height?clamp((y-window.height/2)/(height-window.height)*100,0,100):50};
}
function overview(width,height,value,displayWidth,displayHeight){
  if(![displayWidth,displayHeight].every(Number.isFinite)||displayWidth<=0||displayHeight<=0)throw new Error('The source view dimensions are invalid.');const window=rect(width,height,value),scale=Math.min(displayWidth/width,displayHeight/height),image={x:(displayWidth-width*scale)/2,y:(displayHeight-height*scale)/2,width:width*scale,height:height*scale};
  return {image,window:{x:image.x+window.x*scale,y:image.y+window.y*scale,width:window.width*scale,height:window.height*scale},scale};
}
function source(picture){
  if(!picture.source){
    let width=128,height=192;
    if(picture.keepResolution===true){
      const bytes=Uint8Array.from(atob(picture.data.slice(22,54)),char=>char.charCodeAt(0));
      if(bytes.length<24)throw new Error('The saved PNG header is invalid.');
      const view=new DataView(bytes.buffer);width=view.getUint32(16);height=view.getUint32(20);dimensions(width,height,defaults(),true);
    }
    return {data:picture.data,width,height,crop:defaults(),original:false};
  }
  const saved=picture.source;
  if(typeof saved.data!=='string'||saved.data.length>(saved.preserved===true?14*1024*1024:450000)||!new RegExp('^data:image[/](?:png|webp'+(saved.preserved===true?'|jpeg':'')+');base64,[A-Za-z0-9+/]+={0,2}$').test(saved.data)||!Number.isInteger(saved.width)||!Number.isInteger(saved.height)||saved.width<1||saved.height<1||saved.width>(saved.preserved===true?8192:1536)||saved.height>(saved.preserved===true?8192:1536)||saved.width*saved.height>16777216)throw new Error('This saved source image is invalid. Choose the image again.');
  return {...saved,crop:crop(picture.crop),original:true};
}
const api={defaults,crop,rect,dimensions,pan,place,overview,source};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritagePicture=api;
})();
