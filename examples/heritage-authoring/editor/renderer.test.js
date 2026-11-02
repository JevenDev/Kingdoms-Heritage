'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),P=require('./engine.js');
async function renderer() {
  const draws=[],ctx={canvas:{width:640,height:360},globalAlpha:1,stack:[],pose:{x:0,y:0},
    save(){this.stack.push({...this.pose});},restore(){this.pose=this.stack.pop();},
    translate(x,y){this.pose.x+=x;this.pose.y+=y;},scale(){},transform(){},fillRect(){},
    drawImage(image){draws.push({x:this.pose.x,y:this.pose.y,color:image.color,alpha:this.globalAlpha});}};
  const document={createElement(){const canvas={};canvas.getContext=()=>({drawImage(){},getImageData(){return {data:new Uint8ClampedArray(8*8*4).fill(255)};},fillRect(){canvas.color=this.fillStyle;}});return canvas;}};
  const context=vm.createContext({HeritagePreview:P,HeritageAssets:{providers:[{image:'font',chars:['A'],height:8,ascent:7}]},document,Image:class {width=8;height=8;async decode(){}}});
  vm.runInContext(fs.readFileSync(require.resolve('./renderer.js'),'utf8'),context);
  const canvas=new context.HeritageCanvas(ctx);await canvas.load();return {canvas,draws};
}

test('card shadow uses the native one-pixel offset, quarter color and text opacity',async()=>{
  const {canvas,draws}=await renderer(),glyphs=P.parse('<#4c9edd>A</#4c9edd>');
  canvas.block({x:10,y:20,scale:1,column:0,lines:[{width:9,glyphs}],lineHeight:9},Infinity,128,0,false,true);
  assert.deepEqual(draws,[{x:11,y:21,color:'#132737',alpha:128/255},{x:10,y:20,color:'#4c9edd',alpha:128/255}]);
});

test('existing card text keeps its four-direction outline by default',async()=>{
  const {canvas,draws}=await renderer(),glyphs=P.parse('A');
  canvas.block({x:10,y:20,scale:1,column:0,lines:[{width:9,glyphs}],lineHeight:9},Infinity,255,0);
  assert.deepEqual(draws.map(({x,y,color})=>({x,y,color})),[{x:9,y:20,color:'#000000'},{x:11,y:20,color:'#000000'},{x:10,y:19,color:'#000000'},{x:10,y:21,color:'#000000'},{x:10,y:20,color:'#ffffff'}]);
});

test('arrival intros apply either style while retaining animated glyph positions and colors',async()=>{
  for(const outline of [true,false]){
    const {canvas,draws}=await renderer(),config={...P.defaults,text:'<wave><#4c9edd>A</#4c9edd></wave>',subtitle:'',animation:'immediate',outline,cinematic_bars:false};
    canvas.intro(config,{},config.black_hold_ticks+20,640,360);assert.equal(draws.length,outline?5:2);
    const main=draws.at(-1);assert.equal(main.color,'#4c9edd');assert.equal(main.alpha,1);
    for(const draw of draws.slice(0,-1)){assert.equal(draw.color,outline?'#000000':'#132737');assert.equal(Math.abs(draw.x-main.x)+Math.abs(draw.y-main.y),outline?1:2);}
  }
});
