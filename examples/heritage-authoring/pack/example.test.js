'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Example=require('./example.js'),Pack=require('./engine.js'),Project=require('./project.js'),Flow=require('./flow.js');
const scout=require('../templates/trail-scout-kit.json');
const ids=()=>{let index=0;return ()=>'example-'+(++index);};
function build(project){const catalog=Object.fromEntries(['kits','intros'].map(kind=>[kind,project[kind][kind].map(entry=>({id:entry.id,document:entry.state.document,error:'',warnings:[]}))]));const output=Pack.build(project.pack,catalog);assert.deepEqual(output.errors,[]);return output;}

test('the starter example creates two playable locations sharing fixed gear, a shop and an intro',async()=>{
  const project=await Example.create(ids());assert.equal(project.pack.locations.length,2);assert.equal(project.kits.kits.length,2);assert.equal(project.intros.intros.length,1);
  const [home,plains]=project.pack.locations;assert.equal(home.fields.type,'default');assert.equal(plains.fields.target,'minecraft:plains');assert.equal(home.intro,plains.intro);assert.deepEqual(home.kits,plains.kits);
  const output=build(project),choices=Flow.catalog(output,{spawns:[],kits:[]});assert.equal(choices.spawns.length,2);assert.equal(choices.kits.length,2);
  const {id,...exported}=choices.kits.find(kit=>kit.title===scout.title);
  assert.deepEqual(exported.items,scout.items);
  assert.deepEqual(exported.shop,scout.shop);
  for(const spawn of choices.spawns){
    const session=new Flow.Session(choices);session.choose(spawn.id);assert.equal(session.allowed().length,2);session.next();
    session.select(session.allowed().findIndex(kit=>kit.id===id));session.next();assert.equal(session.phase,'kit-shop');
    assert.deepEqual(session.loadout().items,scout.items);
    for(const offer of [0,1,3])assert.equal(session.buy(offer),true);
    assert.equal(session.spent,8);assert.equal(session.refund(3),true);assert.equal(session.spent,7);
    session.next();assert.equal(session.phase,'loading');assert.ok(session.arrival.intro);
  }
});

test('editing the shared starter drafts updates both exported locations',async()=>{
  const project=await Example.create(ids());project.intros.intros[0].state.document.text='A changed beginning';project.kits.kits.find(kit=>kit.state.document.title==='Traveler').state.document.items[1].item.count=12;
  const output=build(project),choices=Flow.catalog(output,{spawns:[],kits:[]});assert.ok(choices.spawns.every(spawn=>spawn.intro.text==='A changed beginning'));assert.equal(choices.kits.find(kit=>kit.title==='Traveler').items[1].item.count,12);
});

test('each example has an independent namespace and merges without changing existing drafts',async()=>{
  const createId=ids(),first=await Example.create(createId),second=await Example.create(createId),before=JSON.stringify(first);
  assert.notEqual(first.pack.namespace,second.pack.namespace);
  const merged=Project.merge(second,{kits:first.kits,intros:first.intros},createId);assert.equal(JSON.stringify(first),before);assert.equal(merged.kits.kits.length,4);assert.equal(merged.intros.intros.length,2);build(merged);
});

test('enabling bundled defaults after importing the example removes stale disable overrides',async()=>{
  const project=await Example.create(ids());project.pack.keepKits=true;project.pack.keepLocations=true;
  for(const location of project.pack.locations)location.kitMode='all';
  const output=build(project),bundled=require('./assets/defaults.json'),choices=Flow.catalog(output,bundled);
  assert.equal(choices.kits.length,3);assert.equal(choices.spawns.length,6);
  for(const spawn of choices.spawns)assert.ok(spawn.kits.every(id=>choices.kits.some(kit=>kit.id===id)));
  assert.ok(!output.files.some(file=>/^data\/kingdomsheritage\/heritage\/(kits|spawns)\//.test(file.path)&&JSON.parse(file.content).enabled===false));
  project.pack.keepKits=false;project.pack.keepLocations=false;
  const disabled=Flow.catalog(build(project),bundled);assert.equal(disabled.kits.length,2);assert.equal(disabled.spawns.length,2);
});
