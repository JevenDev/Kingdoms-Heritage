'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Pack=require('./engine.js'),Flow=require('./flow.js'),Preview=require('../editor/engine.js'),bundled=require('./assets/defaults.json');
const Kit=require('../kit/engine.js');
function workspace(){
  const nodes=new Map(),listeners=new Map(),frames=new Map(),draws=[],monitorOptions=[];let frameId=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:String(id).includes('resolution')?'1920x1080':id==='flow-scale'?'0':'',checked:false,hidden:false,dataset:{},style:{setProperty(){}},parentElement:{style:{setProperty(){}},after(){}},classList:{toggle(){}},events:{},children:[],addEventListener(type,listener){this.events[type]=listener;},setAttribute(){},replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);}});return nodes.get(id);};
  const document={hidden:false,getElementById:node,querySelectorAll:()=>[],createElement:()=>node(Symbol()),addEventListener(type,listener){listeners.set(type,listener);}};
  const monitor={defaults:bundled,textFit:()=>({}),pictures:async()=>{},needsResourcePack:()=>false,draw(value){draws.push(value);return Preview.guiViewport(value.width,value.height,value.guiScale);}};
  const tools={connect(){},update(){},preview:spawns=>spawns,page:()=>null};
  const context=vm.createContext({document,structuredClone,performance:{now:()=>1000},Option:class {constructor(text,value){this.text=text;this.value=value;}},HeritagePreview:Preview,HeritageFlow:Flow,HeritagePack:Pack,HeritageKit:Kit,
    HeritageDialogueAudio:{create:()=>({stop(){},syncMute(){}})},HeritageCardTools:{create:()=>tools},HeritageFlowPreview:{monitorPreview:async(node,options)=>{monitorOptions.push(options);return monitor;}},HeritageItemText:{name:item=>Flow.place(item.id),tooltip:item=>[item.id],parse:text=>text,colors:{gray:'gray'}},HeritageInventory:{setupTooltips(){},bindTooltip(node,content){node.tooltip=content;},icon:()=>node(Symbol())},HeritageIcons:{action(){}},
    requestAnimationFrame(callback){frames.set(++frameId,callback);return frameId;},cancelAnimationFrame(id){frames.delete(id);}});
  vm.runInContext(fs.readFileSync(require.resolve('./workspace-visuals.js'),'utf8'),context);
  const view=context.HeritageWorkspaceVisuals.create({textFits(){}});
  return {node,monitorOptions,find:className=>[...nodes.values()].filter(node=>node.className===className),controls:()=>[...nodes.values()].filter(node=>node.className==='kit-preview-controls'),async render(state,catalog,part='kits',invalid=false,output=Pack.build(state,catalog)){
    if(!invalid)assert.deepEqual(output.errors,[]);else assert.ok(output.errors.length);
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

test('workspace kit browsing includes every allowed kit and changes only the preview',async()=>{
  const view=workspace(),{state,catalog}=fixture();state.locations[0].kitMode='selected';state.locations[0].kits=['two','one'];
  catalog.kits.push({id:'excluded',name:'Excluded',document:{title:'Excluded',items:[]},error:'',warnings:[]});state.kits.push({id:'excluded',path:'excluded',included:true});
  const original=JSON.stringify(state);let draw=await view.render(state,catalog);
  assert.deepEqual(Array.from(draw.kits,kit=>kit.id),['preview:one','preview:two']);
  const controls=view.controls()[1],[previous,label,next]=controls.children,select=label.children[0];
  assert.equal(controls.hidden,false);assert.equal(previous.disabled,true);assert.equal(next.disabled,false);assert.deepEqual(select.children.map(option=>option.value),['one','two']);
  view.monitorOptions[1].selectKit('preview:two');draw=await view.render(state,catalog);assert.equal(draw.kit.id,'preview:two');assert.equal(select.value,'two');assert.equal(next.disabled,true);
  view.monitorOptions[1].selectKit('preview:excluded');draw=await view.render(state,catalog);assert.equal(draw.kit.id,'preview:two');
  previous.events.click();draw=await view.render(state,catalog);assert.equal(draw.kit.id,'preview:one');
  select.value='two';select.events.change();draw=await view.render(state,catalog);assert.equal(draw.kit.id,'preview:two');
  view.node('location-card').events.keydown({key:'Home',preventDefault(){}});draw=await view.render(state,catalog);assert.equal(draw.kit.id,'preview:one');assert.equal(JSON.stringify(state),original);
  state.locations[0].kits=['one'];await view.render(state,catalog);assert.equal(controls.hidden,false);
  const mode=controls.children[4].children[0];mode.value='accessories';mode.events.change();draw=await view.render(state,catalog);assert.equal(draw.inventoryMode,'accessories');assert.equal(state.locations[0].kits.length,1);
  await view.render(state,catalog,'intro');assert.equal(controls.hidden,false);
});

test('arrival context changes kit and party substitutions without changing the pack',async()=>{
  const view=workspace(),{state,catalog}=fixture(),original=JSON.stringify({state,catalog});
  await view.render(state,catalog,'intro');const context=view.find('preview-context')[1],player=context.children[0].children[0],party=context.children[1].children[0];
  assert.equal(context.hidden,false);player.value='Robin';player.events.change();party.value='Alex, Steve';party.events.change();view.monitorOptions[1].selectKit('preview:two');
  const draw=await view.render(state,catalog,'intro');assert.equal(draw.names.player,'Robin');assert.equal(draw.names.party_leader,'Robin');assert.equal(draw.names.party_size,'3');assert.equal(draw.names.companions,'Alex and Steve');assert.equal(draw.names.facts.kit,'preview:two');assert.equal(JSON.stringify({state,catalog}),original);
});

test('inline shop purchases, limits, refunds and resets use a temporary loadout',async()=>{
  const view=workspace(),{state,catalog}=fixture();catalog.kits[0].document.shop={budget:3,sections:[{id:'food',name:'Food'}],offers:[{item:{id:'minecraft:bread',count:2},cost:2,limit:1,section:'food'},{item:{id:'minecraft:apple'},cost:2,limit:1}]};
  const original=JSON.stringify({state,catalog});await view.render(state,catalog);view.controls()[1].children[3].events.click();await view.render(state,catalog);
  const shop=view.find('preview-shop')[1];assert.equal(shop.hidden,false);let offers=shop.children[1];assert.deepEqual(Array.from(offers.children[0].tooltip()),['minecraft:bread','Price: 2 points · 0/1 bought']);offers.children[0].events.click();let draw=await view.render(state,catalog);
  assert.equal(draw.kit.items[0].item.id,'minecraft:bread');assert.equal(draw.kit.items[0].item.count,2);offers=shop.children[1];assert.equal(offers.children[0].disabled,true);assert.equal(offers.children[1].disabled,true);assert.match(offers.children[0].tooltip()[1],/1\/1 bought.*Limit reached/);
  draw=await view.render(state,catalog,'intro');assert.equal(draw.names.facts.receives_kit,'true');await view.render(state,catalog);
  shop.children[2].children[0].events.click();draw=await view.render(state,catalog);assert.equal(draw.kit.items.length,0);
  const sections=shop.children[0].children[2];sections.value='food';sections.events.change();await view.render(state,catalog);assert.equal(shop.children[1].children.filter(node=>node.type==='button').length,1);
  shop.children[1].children[0].events.click();await view.render(state,catalog);shop.children[0].children[1].events.click();draw=await view.render(state,catalog);assert.equal(draw.kit.items.length,0);
  shop.children[1].children[0].events.click();await view.render(state,catalog);view.monitorOptions[1].selectKit('preview:two');await view.render(state,catalog);view.monitorOptions[1].selectKit('preview:one');draw=await view.render(state,catalog);assert.equal(draw.kit.items.length,0);assert.equal(shop.hidden,true);assert.equal(JSON.stringify({state,catalog}),original);
});

test('inline shop pages retain explicit offer positions',async()=>{
  const view=workspace(),{state,catalog}=fixture();catalog.kits[0].document.shop={budget:3,columns:4,offers:[{item:{id:'minecraft:bread'},cost:1,position:{row:3,column:5}}]};
  await view.render(state,catalog);view.controls()[1].children[3].events.click();await view.render(state,catalog);const shop=view.find('preview-shop')[1];
  assert.equal(shop.children[1].children.filter(node=>node.type==='button').length,0);shop.children[2].children[2].events.click();await view.render(state,catalog);
  assert.equal(shop.children[1].children[8].type,'button');assert.equal(shop.children[2].children[2].disabled,true);shop.children[1].children[8].events.click();const draw=await view.render(state,catalog);assert.equal(draw.kit.items[0].item.id,'minecraft:bread');
});

test('an intro with no valid kits keeps context available and kit navigation hidden',async()=>{
  const view=workspace(),{state,catalog}=fixture();for(const kit of catalog.kits){kit.source='{';kit.error='Invalid JSON';}
  const draw=await view.render(state,catalog,'intro',true);assert.equal(draw.kitCount,0);assert.equal(view.controls()[1].hidden,true);assert.equal(view.find('preview-context')[1].hidden,false);
  view.node('location-card').events.keydown({key:'Home',preventDefault(){}});
});

test('workspace updates parse the exported catalog once and refresh it after edits',async t=>{
  const catalog=Flow.catalog;let calls=0;t.mock.method(Flow,'catalog',(...args)=>{calls++;return catalog(...args);});
  const view=workspace(),data=fixture();let draw=await view.render(data.state,data.catalog);assert.equal(calls,1);assert.equal(draw.kit.title,'one');
  data.catalog.kits[0].document.title='Renamed';draw=await view.render(data.state,data.catalog);assert.equal(calls,2);assert.equal(draw.kit.title,'Renamed');
});

test('changing workspace views reuses parsed preview data until the output changes',async t=>{
  const catalog=Flow.catalog;let calls=0;t.mock.method(Flow,'catalog',(...args)=>{calls++;return catalog(...args);});
  const view=workspace(),data=fixture(),output=Pack.build(data.state,data.catalog);
  await view.render(data.state,data.catalog,'kits',false,output);await view.render(data.state,data.catalog,'intro',false,output);assert.equal(calls,1);
  view.monitorOptions[1].selectKit('preview:two');const draw=await view.render(data.state,data.catalog,'kits',false,output);assert.equal(draw.kit.id,'preview:two');assert.equal(calls,1);
  data.catalog.kits[1].document.title='Changed';const updated=await view.render(data.state,data.catalog);assert.equal(updated.kit.title,'Changed');assert.equal(calls,2);
});

test('site previews show included cosmetic armor in shop kits before and after a purchase',async()=>{
  const view=workspace(),{state,catalog}=fixture(),inventory=Kit.cosmeticArmorInventory;
  const helmet={inventory,index:3,item:{id:'minecraft:golden_helmet'}};
  catalog.kits[1].document.items=[helmet];
  catalog.kits[1].document.shop={budget:1,offers:[{cost:1,item:{id:'minecraft:stick'}}]};
  await view.render(state,catalog);
  const controls=view.controls()[1],mode=controls.children[4].children[0];
  assert.ok(mode.children.some(option=>option.value===inventory));
  mode.value=inventory;mode.events.change();view.selectKit('two');
  let draw=await view.render(state,catalog);
  assert.equal(draw.inventoryMode,inventory);
  assert.equal(draw.kit.items[0].item.id,helmet.item.id);
  controls.children[3].events.click();await view.render(state,catalog);
  view.find('preview-shop')[1].children[1].children[0].events.click();
  draw=await view.render(state,catalog);
  assert.equal(draw.inventoryMode,inventory);
  assert.equal(draw.kit.items.find(entry=>entry.inventory===inventory).item.id,helmet.item.id);
  assert.equal(draw.kit.items.find(entry=>entry.inventory!==inventory).item.id,'minecraft:stick');
});
