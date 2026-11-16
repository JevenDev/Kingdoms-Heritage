(() => {
'use strict';
const canvas=document.getElementById('home-background'),button=document.getElementById('background-motion');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false});
if(!gl)return;
let source,resolution,time,frame=0,last=null,elapsed=0,paused=motion.matches,lost=false;
function compile(kind,code) {
  const shader=gl.createShader(kind);gl.shaderSource(shader,code);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
    const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message);
  }
  return shader;
}
function initialize() {
  const vertex=compile(gl.VERTEX_SHADER,'#version 300 es\nin vec2 Position;void main(){gl_Position=vec4(Position,0.,1.);}');
  const fragment=compile(gl.FRAGMENT_SHADER,source.replace('#version 150','#version 300 es\nprecision highp float;\nprecision highp int;'));
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    const message=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error(message);
  }
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'Position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  resolution=gl.getUniformLocation(program,'Resolution');time=gl.getUniformLocation(program,'Time');
}
function draw(now) {
  frame=0;
  if(document.hidden||lost)return;
  if(last===null||now-last>=1000/30){
    const scale=Math.min(1,640/canvas.clientWidth,360/canvas.clientHeight);
    const width=Math.max(1,Math.round(canvas.clientWidth*scale)),height=Math.max(1,Math.round(canvas.clientHeight*scale));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    if(last!==null)elapsed+=(now-last)/1000;
    last=now;
    gl.viewport(0,0,width,height);gl.uniform2f(resolution,width,height);gl.uniform1f(time,elapsed);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  if(!paused)frame=requestAnimationFrame(draw);
}
function sync() {
  cancelAnimationFrame(frame);frame=0;last=null;
  button.textContent=paused?'Animate background':'Pause background';
  draw(performance.now());
}
function failed(error) {
  lost=true;cancelAnimationFrame(frame);canvas.style.visibility='hidden';button.hidden=true;
  console.warn('Home background could not load:',error);
}
async function load() {
  const response=await fetch('pack/assets/selection_background.fsh');
  if(!response.ok)throw new Error('Background shader request failed ('+response.status+').');
  source=await response.text();initialize();button.hidden=false;
  button.addEventListener('click',()=>{paused=!paused;sync();});
  motion.addEventListener('change',()=>{paused=motion.matches;sync();});
  document.addEventListener('visibilitychange',sync);
  new ResizeObserver(sync).observe(canvas);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);});
  canvas.addEventListener('webglcontextrestored',()=>{
    try{initialize();lost=false;sync();}catch(error){failed(error);}
  });
  sync();
}
load().catch(failed);
})();
