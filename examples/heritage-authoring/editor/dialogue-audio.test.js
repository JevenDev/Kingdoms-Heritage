'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),P=require('./engine.js');
function player(){
  const sources=[],gains=[];let decodes=0,contexts=0;
  class Context {
    currentTime=10;destination={};
    constructor(options){contexts++;assert.equal(options.latencyHint,'interactive');}
    async resume(){}
    async decodeAudioData(bytes){decodes++;assert.equal(bytes.byteLength,3);return {};}
    createGain(){const gain={gain:{value:0},connect(){}};gains.push(gain);return gain;}
    createBufferSource(){const source={playbackRate:{value:1},connect(){},start(time){this.time=time;},stop(){this.stopped=true;}};sources.push(source);return source;}
  }
  const sandbox={module:{exports:{}},AudioContext:Context,HeritageAssets:{blip:'data:audio/ogg;base64,AQID'},atob};vm.runInNewContext(fs.readFileSync(require.resolve('./dialogue-audio.js'),'utf8'),sandbox);return {api:sandbox.module.exports,sources,gains,get decodes(){return decodes;},get contexts(){return contexts;}};
}
test('dialogue buffers schedule cues on the audio clock and skip audio before the playhead',async()=>{
  const state=player(),audio=state.api.create();assert.equal(state.contexts,0);await audio.start([{tick:3,pitch:.9},{tick:8,pitch:1.1},{tick:12,pitch:1}],()=>5);assert.equal(state.sources.length,2);assert.ok(Math.abs(state.sources[0].time-10.15)<.000001);assert.ok(Math.abs(state.sources[1].time-10.35)<.000001);assert.equal(state.sources[0].playbackRate.value,1.1);assert.equal(state.gains[0].gain.value,.35);audio.stop();assert.ok(state.sources.every(source=>source.stopped));
});
test('cancelled preparation never starts stale cues and speech instances share the decoded sample',async()=>{
  const state=player(),first=state.api.create(),second=state.api.create({volume:.7}),pending=first.start([{tick:1,pitch:1}]);first.stop();assert.equal(await pending,false);assert.equal(state.sources.length,0);await second.start([{tick:2,pitch:1}]);await first.start([{tick:3,pitch:1}]);assert.equal(state.contexts,1);assert.equal(state.decodes,1);assert.equal(state.sources.length,2);assert.equal(state.gains[0].gain.value,.7);
});
test('muting a preview suppresses cues without replaying skipped audio when unmuted',async()=>{
  const state=player();let muted=true;const audio=state.api.create({muted:()=>muted});assert.equal(await audio.start([{tick:1,pitch:1}]),false);assert.equal(state.contexts,0);muted=false;await audio.start([{tick:1,pitch:1},{tick:5,pitch:1}],3);assert.equal(state.sources.length,1);muted=true;audio.syncMute();assert.equal(state.gains[0].gain.value,0);muted=false;audio.syncMute();assert.equal(state.gains[0].gain.value,.35);assert.equal(state.sources.length,1);
});
test('intro blips follow newly revealed characters at game tick boundaries',()=>{
  const config={...P.defaults,text:'ABCDEFGHIJKL',subtitle:'',animation:'letter_by_letter',black_hold_ticks:0,reveal_ticks:26,blip:true};const cues=P.blipCues(config,{},()=>0);assert.deepEqual(cues.map(cue=>cue.tick),[6,12,18,24]);assert.deepEqual(cues.map(cue=>cue.count),[3,6,9,12]);assert.ok(cues.every(cue=>cue.pitch===.9));assert.deepEqual(P.blipCues({...config,blip:false}),[]);
});
test('immediate and fade-in blips start with the text and do not sound through bars or whitespace',()=>{
  const base={...P.defaults,text:'ABC',subtitle:'',black_hold_ticks:0,blip:true,timeline:{text_start_ticks:15,bar_start_ticks:0,bar_enter_ticks:20,bar_hold_ticks:80,bar_exit_ticks:20}};
  for(const animation of ['fade_in','immediate'])assert.deepEqual(P.blipCues({...base,animation},{},()=>0).map(cue=>cue.tick),[15]);assert.deepEqual(P.blipCues({...base,text:'... ¼ !',animation:'immediate'}, {},()=>0),[]);
});

test('preview blip ticks and revealed counts match captures from the native intro overlay',()=>{
  const native=require('./native-blips.json');for(const [file,hash] of Object.entries(native.nativeSources)){const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../../src/main/java/com/jvn/kingdomsheritage',file),'utf8').replaceAll('\r\n','\n');assert.equal(require('node:crypto').createHash('sha256').update(source).digest('hex'),hash,file+' changed, capture native blips again');}
  for(const sample of native.samples){const config={...P.defaults,text:'One two...',subtitle:'Three 42!',animation:sample.animation,reveal_ticks:40,hold_ticks:60,fade_out_ticks:20,timeline:{text_start_ticks:sample.start,bar_start_ticks:0,bar_enter_ticks:12,bar_hold_ticks:100,bar_exit_ticks:30}},cues=P.blipCues(config,{},()=>0).map(({tick,count})=>({tick,count}));assert.deepEqual(cues,sample.cues,sample.animation+' at '+sample.start);}
});
