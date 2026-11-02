'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Pack=require('./engine.js'),Flow=require('./flow.js'),Preview=require('../editor/engine.js'),bundled=require('./assets/defaults.json');
function workspace(){
  const nodes=new Map(),listeners=new Map(),frames=new Map(),draws=[];let frameId=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:String(id).includes('resolution')?'1920x1080':id==='flow-scale'?'0':'',checked:false,hidden:false,dataset:{},parentElement:{style:{setProperty(){}}},classList:{toggle(){}},addEventListener(){},setAttribute(){},replaceChildren(){},append(){}});return nodes.get(id);};
  const document={hidden:false,getElementById:node,querySelectorAll:()=>[],createElement:()=>node(Symbol()),addEventListener(type,listener){listeners.set(type,listener);}};
  const monitor={defaults:bundled,textFit:()=>({}),pictures:async()=>{},needsResourcePack:()=>false,draw(value){draws.push(value);return Preview.guiViewport(value.width,value.height,value.guiScale);}};
  const tools={connect(){},update(){},preview:spawns=>spawns,page:()=>null};
  const context=vm.createContext({document,performance:{now:()=>1000},Option:class {},HeritagePreview:Preview,HeritageFlow:Flow,HeritagePack:Pack,
    HeritageDialogueAudio:{create:()=>({stop(){},syncMute(){}})},HeritageCardTools:{create:()=>tools},HeritageFlowPreview:{monitorPreview:async()=>monitor},HeritageInventory:{setupTooltips(){}},HeritageIcons:{action(){}},
    requestAnimationFrame(callback){frames.set(++frameId,callback);return frameId;},cancelAnimationFrame(id){frames.delete(id);}});
  vm.runInContext(fs.readFileSync(require.resolve('./workspace-visuals.js'),'utf8'),context);
  const view=context.HeritageWorkspaceVisuals.create({textFits(){}});
  return {node,async render(state,catalog,part='kits',invalid=false){
    const output=Pack.build(state,catalog);if(!invalid)assert.deepEqual(output.errors,[]);else assert.ok(output.errors.length);
    await view.update({state,catalog,output,step:'locations',part,pictureData:{}});
    const [id,callback]=frames.entries().next().value??[];assert.ok(callback,node('card-preview-status').textContent);frames.delete(id);callback(1000);
    assert.ok(draws.length,node('card-preview-status').textContent);return draws.at(-1);
  },selectKit(id){listeners.get('click')({target:{closest:selector=>selector==='[data-preview-kit]'?{dataset:{previewKit:id}}:null}});}};
}
function fixture(){
  const location=Pack.location('home');location.intro='arrival';
  return {state:{name:'Preview',namespace:'preview',description:'Parity check',keepKits:false,keepLocations:false,kits:[{id:'one',path:'one',included:true},{id:'two',path:'two',included:true}],locations:[location],active:'home'},
    catalog:{kits:['one','two'].map(id=>({id,name:id,document:{title:id,tags:['preview:shared'],items:[]},error:'',warnings:[]})),intros:[{id:'arrival',name:'Arrival',document:{text:'{kit}',variants:[{when:{tag:'kit',equals:'preview:one'},text:'Correct kit'}]},error:'',warnings:[]}]}};
}
test('workspace previews retain Auto GUI scale and exported kit facts for intro conditions',async()=>{
  const view=workspace(),{state,catalog}=fixture(),draw=await view.render(state,catalog,'intro');
  assert.equal(draw.guiScale,0);assert.equal(Preview.guiViewport(draw.width,draw.height,draw.guiScale).scale,4);
  assert.equal(draw.kit.id,'preview:one');assert.equal(draw.names.facts.kit,'preview:one');
  assert.equal(Preview.playback(draw.intro,draw.names).main.map(glyph=>glyph.ch).join(''),'Correct kit');
  assert.match(view.node('location-visual-scale').textContent,/Auto.*effective 4/);
  state.guiScale=3;assert.equal((await view.render(state,catalog)).guiScale,3);
});
test('workspace kit previews follow exported tags and stop showing an excluded assignment',async()=>{
  const view=workspace(),{state,catalog}=fixture();state.locations[0].importedKitSelectors=['#preview:shared'];
  let draw=await view.render(state,catalog);assert.equal(draw.kitCount,2);assert.equal(draw.kitIndex,0);
  view.selectKit('two');draw=await view.render(state,catalog);assert.equal(draw.kit.id,'preview:two');assert.equal(draw.kitIndex,1);
  state.locations[0].kitMode='selected';state.locations[0].kits=['one'];draw=await view.render(state,catalog);
  assert.equal(draw.kit.id,'preview:one');assert.equal(draw.kitCount,1);assert.equal(draw.kitIndex,0);
  state.keepKits=true;state.locations[0].kits=['bundled-empty'];draw=await view.render(state,catalog);
  assert.equal(draw.kit.id,'kingdomsheritage:default');assert.equal(draw.kit.title,bundled.kits[0].title);assert.equal(draw.kitCount,1);
});

test('an invalid kit draft keeps the location preview available and full flow validation intact',async()=>{
  const view=workspace(),{state,catalog}=fixture();catalog.kits[0].source='{';catalog.kits[0].error='Invalid JSON';
  const draw=await view.render(state,catalog,'details',true);assert.equal(draw.spawns.length,1);assert.equal(draw.kit.id,'preview:two');
  assert.match(view.node('card-preview-status').textContent,/Resolve the highlighted issues/);
});
