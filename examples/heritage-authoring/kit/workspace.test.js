'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Workspace=require('./workspace.js');
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.001,actual+' should equal '+expected);

test('workspace widths fit desktop space while respecting usable column minimums',()=>{
  for(const width of [900,1050,1604,2200]){
    for(const weights of [[1,1,1],[900,10,10],[10,900,10],[10,10,900]]){
      const columns=Workspace.fit(weights,width);
      close(columns.reduce((sum,value)=>sum+value,0),width-32);
      for(const [index,minimum] of [320,300,200].entries())assert.ok(columns[index]>=minimum);
    }
  }
});

test('dragging either divider changes only its adjacent columns and clamps at both ends',()=>{
  const widths=Workspace.defaults(1604);
  for(const index of [0,1]){
    const moved=Workspace.move(widths,index,40);
    close(moved[index],widths[index]+40);close(moved[index+1],widths[index+1]-40);
    assert.equal(moved[index===0?2:0],widths[index===0?2:0]);
    for(const delta of [-Infinity,Infinity]){
      const limited=Workspace.move(widths,index,delta);
      close(limited.reduce((sum,value)=>sum+value,0),widths.reduce((sum,value)=>sum+value,0));
      assert.ok(limited[index]>=[320,300][index]);assert.ok(limited[index+1]>=[300,200][index]);
    }
  }
  assert.deepEqual(widths,Workspace.defaults(1604));
});

test('saved widths survive tab reuse and smaller windows without losing the preferred proportions',()=>{
  const saved=Workspace.move(Workspace.defaults(1604),1,-90),copy=[...saved];
  Workspace.fit(saved,900);
  const restored=Workspace.fit(JSON.parse(JSON.stringify(saved)),1604);
  restored.forEach((value,index)=>close(value,saved[index]));assert.deepEqual(saved,copy);
});

test('reset defaults retain the desktop inventory and catalog proportions',()=>{
  const columns=Workspace.defaults(1604);
  close(columns[1],1604*.32);assert.equal(columns[2],320);close(columns[0],1604-32-columns[1]-320);
});

test('narrow editor panes keep every column nonnegative when a divider reaches its limit',()=>{
  for(const width of [500,640,820]){
    const columns=Workspace.defaults(width);
    for(const index of [0,1])for(const delta of [-Infinity,Infinity]){
      const moved=Workspace.move(columns,index,delta);
      assert.ok(moved.every(value=>value>=0));close(moved.reduce((sum,value)=>sum+value,0),width-32);
    }
  }
});
