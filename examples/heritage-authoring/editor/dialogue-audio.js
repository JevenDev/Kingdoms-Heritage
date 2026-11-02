(() => {
'use strict';
let context,buffer,loading;
async function prepare(){
  context??=new AudioContext({latencyHint:'interactive'});
  await context.resume();
  if(buffer)return buffer;
  loading??=(async()=>{const decoded=atob(HeritageAssets.blip.split(',')[1]),bytes=new Uint8Array(decoded.length);for(let index=0;index<decoded.length;index++)bytes[index]=decoded.charCodeAt(index);buffer=await context.decodeAudioData(bytes.buffer);return buffer;})().catch(error=>{loading=null;throw error;});
  return loading;
}
function create({volume=.35,muted=()=>false}={}){
  const sources=new Set();let gain,generation=0;
  function stop(){generation++;for(const source of sources)source.stop();sources.clear();}
  function syncMute(){if(gain)gain.gain.value=muted()?0:volume;}
  async function start(cues,tick=0){
    stop();const request=generation;if(muted()||!cues.length)return false;await prepare();if(request!==generation)return false;
    if(!gain){gain=context.createGain();gain.connect(context.destination);}syncMute();const position=typeof tick==='function'?tick():tick,origin=context.currentTime-position/20;
    for(const cue of cues){
      if(cue.tick<position)continue;const source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=cue.pitch;source.connect(gain);sources.add(source);source.onended=()=>sources.delete(source);source.start(Math.max(context.currentTime,origin+cue.tick/20));
    }
    return true;
  }
  return {prepare,start,stop,syncMute};
}
const api={create,prepare};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageDialogueAudio=api;
})();
