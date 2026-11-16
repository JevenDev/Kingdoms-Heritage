'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function surface(){
  const events=new Map(),nodes=[];
  class Node {
    constructor(tag,id=''){this.tagName=tag.toUpperCase();this.id=id;this.dataset={};this.attributes={};this.children=[];this.style={};this.isConnected=true;nodes.push(this);}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    removeAttribute(name){delete this.attributes[name];}
    append(...children){for(const node of children){node.parentElement=this;this.children.push(node);}}
    matches(selector){return selector.split(',').some(part=>part==='[data-tooltip]'?!!this.dataset.tooltip:part==='[role=separator]'?this.attributes.role==='separator':part===':popover-open'?false:part.toUpperCase()===this.tagName||part==='#'+this.id||part==='.'+this.className);}
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
    contains(child){for(let node=child;node;node=node.parentElement)if(node===this)return true;return false;}
  }
  const body=new Node('body'),document={body,getElementById:id=>nodes.find(node=>node.id===id),querySelectorAll:()=>[],createElement:tag=>new Node(tag),addEventListener:(type,fn)=>events.set(type,fn)};
  const context=vm.createContext({document,window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){}});
  vm.runInContext(fs.readFileSync(require.resolve('./tooltips.js'),'utf8'),context);context.HeritageTooltips.setup({screen:'kit'});
  return {Node,body,fire:(type,target,extra={})=>events.get(type)({target,...extra})};
}

test('controls created after setup receive informative tooltips through their labels',()=>{
  const view=surface(),label=new view.Node('label'),field=new view.Node('input','shop-budget');view.body.append(label);label.append(field);label.setAttribute('title','old native tooltip');
  view.fire('pointerover',field,{pointerType:'mouse',clientX:20,clientY:30});
  assert.match(JSON.parse(label.dataset.tooltip)[1],/Each player/);assert.equal(label.getAttribute('title'),'');
});

test('keyboard tooltip descriptions preserve existing accessibility references on dismissal',()=>{
  const view=surface(),field=new view.Node('input','shop-budget');view.body.append(field);field.setAttribute('aria-describedby','validation-message');
  view.fire('focusin',field);assert.equal(field.getAttribute('aria-describedby'),'validation-message minecraft-tooltip');
  view.fire('keydown',field,{key:'Escape'});assert.equal(field.getAttribute('aria-describedby'),'validation-message');
});

test('resizable dividers expose their non-obvious keyboard and reset controls',()=>{
  const view=surface(),handle=new view.Node('div');handle.className='kit-column-divider';handle.setAttribute('role','separator');view.body.append(handle);
  view.fire('focusin',handle);const help=JSON.parse(handle.dataset.tooltip)[1];
  assert.match(help,/arrow keys/);assert.match(help,/Double-click resets/);assert.match(help,/Shared across kit tabs/);
});

test('self-explanatory controls do not receive generic fallback tooltips',()=>{
  const view=surface(),button=new view.Node('button','close-dialog');view.body.append(button);view.fire('focusin',button);
  assert.equal(button.dataset.tooltip,undefined);assert.equal(button.getAttribute('aria-describedby'),null);
});
