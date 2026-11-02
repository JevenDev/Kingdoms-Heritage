'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Example=require('./example.js'),Pack=require('./engine.js'),Project=require('./project.js'),Flow=require('./flow.js');
const ids=()=>{let index=0;return ()=>'example-'+(++index);};
function build(project){const catalog=Object.fromEntries(['kits','intros'].map(kind=>[kind,project[kind][kind].map(entry=>({id:entry.id,document:entry.state.document,error:'',warnings:[]}))]));const output=Pack.build(project.pack,catalog);assert.deepEqual(output.errors,[]);return output;}

test('the starter example creates two playable locations sharing one kit and one intro',async()=>{
  const project=await Example.create(ids());assert.equal(project.pack.locations.length,2);assert.equal(project.kits.kits.length,1);assert.equal(project.intros.intros.length,1);
  const [home,plains]=project.pack.locations;assert.equal(home.fields.type,'default');assert.equal(plains.fields.target,'minecraft:plains');assert.equal(home.intro,plains.intro);assert.deepEqual(home.kits,plains.kits);
  const output=build(project),choices=Flow.catalog(output,{spawns:[],kits:[]});assert.equal(choices.spawns.length,2);assert.equal(choices.kits.length,1);
  for(const spawn of choices.spawns){const session=new Flow.Session(choices);session.choose(spawn.id);assert.equal(session.allowed().length,1);session.next();assert.equal(session.phase,'loading');assert.ok(session.arrival.intro);}
});

test('editing the shared starter drafts updates both exported locations',async()=>{
  const project=await Example.create(ids());project.intros.intros[0].state.document.text='A changed beginning';project.kits.kits[0].state.document.items[1].item.count=12;
  const output=build(project),choices=Flow.catalog(output,{spawns:[],kits:[]});assert.ok(choices.spawns.every(spawn=>spawn.intro.text==='A changed beginning'));assert.equal(choices.kits[0].items[1].item.count,12);
});

test('each example has an independent namespace and merges without changing existing drafts',async()=>{
  const createId=ids(),first=await Example.create(createId),second=await Example.create(createId),before=JSON.stringify(first);
  assert.notEqual(first.pack.namespace,second.pack.namespace);
  const merged=Project.merge(second,{kits:first.kits,intros:first.intros},createId);assert.equal(JSON.stringify(first),before);assert.equal(merged.kits.kits.length,2);assert.equal(merged.intros.intros.length,2);build(merged);
});
