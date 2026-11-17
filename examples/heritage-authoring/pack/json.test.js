'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./engine.js'),J=require('./json.js'),E=require('./editing.js');
P.setBundledKits(require('./assets/defaults.json').kits);
const kitPath='data/story/heritage/kits/traveler.json',spawnPath='data/story/heritage/spawns/home.json';
const kit={title:'Traveler',tags:['story:starter'],items:[{index:7,item:{id:'minecraft:stone',count:3}}]};
const intro={text:'Welcome home'};
function workspace(){
  const location=P.location('home');location.path='home';location.fields.title='Home';location.intro='arrival';
  return {pack:{version:1,name:'Story',namespace:'story',description:'A story',keepKits:false,keepLocations:false,kits:[{id:'traveler',path:'traveler',included:true}],locations:[location],active:'home'},libraries:{
    kits:{version:2,active:'traveler',kits:[{id:'traveler',state:{source:JSON.stringify(kit),document:P.copy(kit),validDocument:P.copy(kit),drafts:[],cursor:null}}]},
    intros:{version:2,active:'arrival',intros:[{id:'arrival',state:{name:'Arrival',source:JSON.stringify(intro),document:P.copy(intro)}}]}
  }};
}
const read=(value,path,group='data')=>JSON.parse(J.files(value).find(file=>file.path===path&&file.group===group).content);
const apply=(value,path,document,group='data')=>J.apply(value,group,path,JSON.stringify(document),()=>'new-intro');
const base64=value=>Buffer.from(value).toString('base64');

test('pack JSON edits update kit drafts and undo as one workspace change',()=>{
  const value=workspace(),before=JSON.stringify(value),history=new E.History(value.pack,value.libraries);
  const next=apply(value,kitPath,{...kit,title:'Sorcerer',items:[{index:7,ignore_stack_limit:true,item:{id:'minecraft:mushroom_stew',count:3}}]});
  assert.equal(read(next,kitPath).title,'Sorcerer');assert.equal(next.libraries.kits.kits[0].state.validDocument.items[0].ignore_stack_limit,true);
  assert.equal(JSON.stringify(value),before);assert.deepEqual(next.drafts,[{kind:'kits',id:'traveler'}]);
  history.record(next.pack,next.libraries,{drafts:next.drafts,label:'Edit pack JSON'});
  assert.deepEqual(history.plan(-1,next.pack,next.libraries),E.workspace(value.pack,value.libraries));
});

test('location JSON changes fields and selectors without changing shared intros',()=>{
  const value=workspace(),document=read(value,spawnPath),next=apply(value,spawnPath,{...document,title:'New home',kits:['#story:starter'],intro:{text:'A different welcome'},custom:{chapter:3}});
  assert.equal(next.pack.locations[0].id,'home');assert.equal(next.pack.active,'home');
  assert.deepEqual(next.pack.locations[0].kits,['traveler']);assert.equal(next.pack.locations[0].intro,'new-intro');
  assert.deepEqual(next.libraries.intros.intros[0].state.document,intro);
  assert.equal(read(next,spawnPath).intro.text,'A different welcome');assert.deepEqual(read(next,spawnPath).custom,{chapter:3});
  assert.deepEqual(read(next,spawnPath).kits,['#story:starter']);
  assert.equal(apply(value,spawnPath,{...document,title:'Renamed'}).pack.locations[0].intro,'arrival');
});

test('pool destinations, intro removal and manual image paths survive visual rebuilding',()=>{
  const value=workspace(),document=read(value,spawnPath);
  const next=apply(value,spawnPath,{...document,type:'pool',pool:[{type:'fixed',x:1,y:64,z:2,intro:{text:'At the camp'}}],image:'story:textures/camp.png'});
  assert.equal(read(next,spawnPath).pool[0].intro.text,'At the camp');assert.equal(read(next,spawnPath).pool[0].x,1);
  assert.equal(read(next,spawnPath).image,'story:textures/camp.png');assert.equal(next.pack.locations[0].imageMode,'manual');
  delete document.intro;assert.equal(read(apply(value,spawnPath,document),spawnPath).intro,undefined);
});

test('pack metadata and selection JSON retain custom properties and enforce formats',()=>{
  const value=workspace(),next=apply(value,'pack.mcmeta',{pack:{pack_format:48,description:{text:'New story'}},custom:{value:7}});
  assert.deepEqual(read(next,'pack.mcmeta').pack.description,{text:'New story'});assert.deepEqual(read(next,'pack.mcmeta').custom,{value:7});
  const selection=apply(value,P.selectionPath,{gui_scale:3,kit_preview:'model',custom:true});
  assert.equal(selection.pack.guiScale,3);assert.equal(selection.pack.kitPreview,'model');assert.equal(read(selection,P.selectionPath).custom,true);
  assert.throws(()=>apply(value,'pack.mcmeta',{pack:{pack_format:34,description:'Wrong'}}),/pack_format/);
  assert.throws(()=>apply(value,P.selectionPath,{gui_scale:5}),/0 to 4/);
  value.pack.guiScale=6;assert.throws(()=>apply(value,P.selectionPath,{gui_scale:7}),/0 to 4/);
});

test('imported JSON and resource metadata retain unicode and unrelated binary files',()=>{
  const value=workspace();value.pack.importedFiles={data:[{path:'data/story/custom.json',base64:base64('{"text":"before"}')},{path:'opaque.bin',base64:'AAEC'}],resources:[{path:'assets/story/lang/en_us.json',base64:base64('{"story.name":"Before"}')} ]};
  value.pack.description='Changed in the visual editor';
  let next=apply(value,'assets/story/lang/en_us.json',{'story.name':'Café 旅'},'resources');
  assert.equal(read(next,'assets/story/lang/en_us.json','resources')['story.name'],'Café 旅');
  next=apply(next,'pack.mcmeta',{pack:{pack_format:34,description:'Resource description'}},'resources');
  assert.equal(read(next,'pack.mcmeta','resources').pack.description,'Resource description');
  assert.equal(read(next,'pack.mcmeta').pack.description,'Changed in the visual editor');
  next=apply(next,'data/story/custom.json',{text:'Updated'});
  assert.equal(read(next,'data/story/custom.json').text,'Updated');assert.equal(next.pack.importedFiles.data[1].base64,'AAEC');
});

test('JSON repairs malformed saved kits without weakening validation or discarding item drafts',()=>{
  const value=workspace();value.libraries.kits.kits[0].state.source='{';
  assert.equal(read(J.apply(value,'data',kitPath,JSON.stringify(kit)),kitPath).title,'Traveler');
  assert.throws(()=>J.apply(workspace(),'data',kitPath,'{'),SyntaxError);
  assert.throws(()=>apply(workspace(),kitPath,{...kit,items:[{index:7,item:{id:'minecraft:mushroom_stew',count:3}}]}),/count/);
  for(const change of [{cursor:{entry:{}}},{drafts:[[7,{id:'pending'}]]}]){
    const pending=workspace();Object.assign(pending.libraries.kits.kits[0].state,change);
    assert.throws(()=>apply(pending,kitPath,kit),/held item/);
  }
  assert.throws(()=>apply(workspace(),spawnPath,{title:'Home',type:'default',kits:['missing:kit']}),/referenced kit/);
});

test('generated disable files stay read-only and explicit kit ordering is preserved',()=>{
  const value=workspace(),disabled=J.files(value).find(file=>file.path==='data/kingdomsheritage/heritage/spawns/default.json');
  assert.match(disabled.reason,/Pack settings/);assert.throws(()=>apply(value,disabled.path,{enabled:true}),/Pack settings/);
  value.pack.kitOrder=['traveler'];assert.throws(()=>apply(value,kitPath,{...kit,order:20}),/custom kit order/);
  assert.equal(read(apply(value,kitPath,{...read(value,kitPath),title:'Renamed'}),kitPath).order,0);
});


test('editing a pictured location keeps its PNG and generated resource path',()=>{
  const fs=require('node:fs'),path=require('node:path'),value=workspace();
  const png=fs.readFileSync(path.join(__dirname,'../heritage-example-resources/assets/heritage_example/textures/gui/locations/home.png'));
  value.pack.locations[0].picture={name:'home.png',data:'data:image/png;base64,'+png.toString('base64')};value.pack.locations[0].imageMode='upload';
  const document=read(value,spawnPath),next=apply(value,spawnPath,{...document,title:'Picture retained'});
  assert.deepEqual(next.pack.locations[0].picture,value.pack.locations[0].picture);
  assert.equal(read(next,spawnPath).image,document.image);
  const output=P.build(next.pack,J.catalog(next.libraries));assert.deepEqual(output.errors,[]);
  assert.deepEqual(Buffer.from(output.resourceFiles.find(file=>file.path.endsWith('/home.png')).content),png);
});

test('bundled overrides stay editable without changing other bundled definitions',()=>{
  const value=workspace();value.pack.keepKits=true;value.pack.keepLocations=true;
  const stock=P.bundledKits(value.pack)[0],path='data/'+stock.resource.replace(':','/heritage/kits/')+'.json';
  value.pack.bundledKits={[stock.resource]:{...stock.document,title:'Before'}};
  const next=apply(value,path,{...read(value,path),title:'After'});
  assert.equal(read(next,path).title,'After');assert.equal(P.bundledKits(next.pack).length,P.bundledKits(value.pack).length);
  const locationPath='data/kingdomsheritage/heritage/spawns/default.json';
  value.pack.bundledLocations={'kingdomsheritage:default':{title:'Default',type:'default',order:0}};
  assert.equal(read(apply(value,locationPath,{title:'Changed default',type:'default',order:1}),locationPath).title,'Changed default');
});
