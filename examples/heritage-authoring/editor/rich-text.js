(() => {
'use strict';
const P=typeof module!=='undefined'?require('./engine.js'):HeritagePreview;
function atoms(source,names={}){
  const tags=[...source.matchAll(/<(\/?)([^<>]+)>/g)].map(match=>({start:match.index,end:match.index+match[0].length,name:P.canonical(match[2].trim().toLowerCase().split(':')[0]),closing:!!match[1],effect:P.effects(match[2].trim().toLowerCase())})),hidden=new Map(),stack=[];
  const closed=(index,name)=>{let depth=1;for(const next of tags.slice(index+1))if(next.name===name){if(next.closing){if(--depth===0)return true;}else if(next.effect)depth++;}return false;};
  tags.forEach((tag,index)=>{const valid=tag.closing?stack.at(-1)===tag.name:tag.effect&&stack.length<63&&closed(index,tag.name);if(valid){hidden.set(tag.start,tag.end);if(tag.closing)stack.pop();else stack.push(tag.name);}});
  const result=[],glyphs=P.parse(source,names);let glyph=0;
  for(let index=0;index<source.length;){
    if(hidden.has(index)){index=hidden.get(index);continue;}
    if(source[index]==='§'&&index+1<source.length){index+=2;continue;}
    const match=/^<([a-z_][a-z0-9_:./-]*(?:\|[^<>]*)?)>/.exec(source.slice(index)),resolved=match?P.token(match[1],names):null,token=resolved?match:null,text=resolved?resolved.text:source[index]==='\r'?'\n':String.fromCodePoint(source.codePointAt(index)),length=token?token[0].length:source[index]==='\r'&&source[index+1]==='\n'?2:String.fromCodePoint(source.codePointAt(index)).length;
    result.push({start:index,end:index+length,text,token:token?.[1]??null,style:glyphs[glyph]??{effect:{},tint:0xffffff}});glyph+=Array.from(text).length;index+=length;
  }
  return result;
}
function ranges(source,start,end,names){
  const result=[];for(const atom of atoms(source,names))if(atom.end>start&&atom.start<end){const previous=result.at(-1);if(previous?.end===atom.start)previous.end=atom.end;else result.push({start:atom.start,end:atom.end});}return result;
}
function format(source,start,end,open,close,names){
  if(start===end){start=0;end=source.length;}
  const selected=ranges(source,start,end,names);if(!selected.length)return {source,start,end};
  let result=source;for(const range of selected.toReversed())result=result.slice(0,range.start)+open+result.slice(range.start,range.end)+close+result.slice(range.end);
  return {source:result,start:selected[0].start+open.length,end:selected.at(-1).end+(selected.length-1)*(open.length+close.length)+open.length};
}
function replace(source,start,end,text,names){
  const selected=ranges(source,start,end,names);let result=source,at=selected[0]?.start??start;
  for(const range of selected.toReversed())result=result.slice(0,range.start)+result.slice(range.end);
  result=result.slice(0,at)+text+result.slice(at);return {source:result,start:at+text.length,end:at+text.length};
}
function create(field,config){
  const editor=document.createElement('div');editor.id=field.id+'-visual';editor.className='rich-text-field';editor.contentEditable='true';editor.role='textbox';editor.setAttribute('aria-multiline','true');editor.setAttribute('aria-label',config.label+' visual editor');editor.spellcheck=false;field.after(editor);
  let selection={start:0,end:0},rendering=false,composition=null,lastSource=null;
  function position(node,offset){
    if(node===editor){const next=editor.childNodes[offset],previous=editor.childNodes[offset-1];return Number(next?.dataset.start??previous?.dataset.end??0);}
    const span=(node.nodeType===Node.TEXT_NODE?node.parentElement:node).closest('[data-start]');if(!span||!editor.contains(span))return null;
    return Number(offset===0?span.dataset.start:span.dataset.end);
  }
  function remember(){const value=getSelection();if(!value?.rangeCount||!editor.contains(value.anchorNode)||!editor.contains(value.focusNode))return;const anchor=position(value.anchorNode,value.anchorOffset),focus=position(value.focusNode,value.focusOffset);if(anchor!==null&&focus!==null)selection={start:Math.min(anchor,focus),end:Math.max(anchor,focus)};}
  function select(start,end=start){
    const point=offset=>{const spans=[...editor.children],next=spans.find(span=>Number(span.dataset.start)>=offset);if(next)return {node:next.firstChild,offset:0};const previous=spans.findLast(span=>Number(span.dataset.end)<=offset);return previous?{node:editor,offset:spans.indexOf(previous)+1}:{node:editor,offset:0};};
    const a=point(start),b=point(end),range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);const value=getSelection();value.removeAllRanges();value.addRange(range);selection={start,end};
  }
  function refresh(){
    if(rendering||composition)return;const source=field.value;editor.contentEditable=String(!field.readOnly&&!field.disabled);editor.setAttribute('aria-readonly',String(field.readOnly));
    if(source===lastSource&&editor.childNodes.length)return;lastSource=source;editor.replaceChildren();
    const list=field.readOnly?Array.from(source).map((text,index)=>({text,start:index,end:index+text.length,style:{effect:{},tint:0xffffff}})):atoms(source,config.names());
    for(const atom of list){
      const span=document.createElement('span');span.textContent=atom.text;span.dataset.start=atom.start;span.dataset.end=atom.end;const effect=atom.style.effect;span.style.color='#'+atom.style.tint.toString(16).padStart(6,'0');if(effect.bold)span.style.fontWeight='700';if(effect.italic)span.style.fontStyle='italic';span.style.textDecoration=[effect.underline?'underline':'',effect.strike?'line-through':''].filter(Boolean).join(' ');
      if(atom.token){span.dataset.locationToken=atom.token;span.contentEditable='false';span.title='<'+atom.token+'>';span.setAttribute('aria-label',atom.token+' placeholder: '+atom.text);}else if(P.active(effect))span.title=Object.keys(effect).filter(key=>effect[key]===true).join(', ');
      editor.append(span);
    }
  }
  function apply(value){
    if(field.readOnly||field.disabled)return;rendering=true;field.value=value.source;config.change(field);rendering=false;lastSource=null;refresh();editor.focus();select(value.start,value.end);
  }
  const insert=text=>apply(replace(field.value,selection.start,selection.end,text,config.names()));
  function remove(backward,word=false){
    remember();if(selection.start!==selection.end){insert('');return;}
    const list=atoms(field.value,config.names()),index=backward?list.findLastIndex(atom=>atom.end<=selection.start):list.findIndex(atom=>atom.start>=selection.end);if(index<0)return;
    let next=index;if(word)while(next+(backward?-1:1)>=0&&next+(backward?-1:1)<list.length&&!/\s/.test(list[next+(backward?-1:1)].text)&&!list[next].token)next+=backward?-1:1;
    selection={start:list[Math.min(index,next)].start,end:list[Math.max(index,next)].end};insert('');
  }
  editor.addEventListener('focus',()=>{config.focus(field);remember();});document.addEventListener('selectionchange',remember);
  editor.addEventListener('beforeinput',event=>{
    if(event.isComposing||composition)return;if(!event.cancelable)return;event.preventDefault();remember();
    if(['insertText','insertReplacementText'].includes(event.inputType))insert(event.data??'');
    else if(['insertParagraph','insertLineBreak'].includes(event.inputType))insert('\n');
    else if(event.inputType.startsWith('delete'))remove(event.inputType.endsWith('Backward'),event.inputType.includes('Word'));
    else if(event.inputType==='historyUndo')document.getElementById('undo').click();else if(event.inputType==='historyRedo')document.getElementById('redo').click();
  });
  editor.addEventListener('compositionstart',()=>{remember();composition={source:field.value,...selection};});
  editor.addEventListener('compositionend',event=>{const original=composition;composition=null;if(original)apply(replace(original.source,original.start,original.end,event.data??'',config.names()));});
  editor.addEventListener('paste',event=>{event.preventDefault();remember();insert(event.clipboardData.getData('text/plain'));});
  const copySelection=event=>{remember();if(selection.start===selection.end)return;event.preventDefault();event.clipboardData.setData('text/plain',atoms(field.value,config.names()).filter(atom=>atom.end>selection.start&&atom.start<selection.end).map(atom=>atom.token?'<'+atom.token+'>':atom.text).join(''));if(event.type==='cut')insert('');};
  editor.addEventListener('copy',copySelection);editor.addEventListener('cut',copySelection);editor.addEventListener('drop',event=>{event.preventDefault();remember();insert(event.dataTransfer.getData('text/plain'));});
  editor.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey)return;const key=event.key.toLowerCase();
    if(key==='z'||key==='y'){event.preventDefault();event.stopPropagation();document.getElementById(key==='y'||event.shiftKey?'redo':'undo').click();}
    if(['b','i','u'].includes(key)){event.preventDefault();const tag={b:'bold',i:'italic',u:'underline'}[key];apply(format(field.value,selection.start,selection.end,'<'+tag+'>','</'+tag+'>',config.names()));}
  });
  refresh();return {element:editor,refresh,insert,focus:()=>{editor.focus();select(selection.start,selection.end);},format:(open,close)=>apply(format(field.value,selection.start,selection.end,open,close,config.names())),setSelection:select};
}
const api={atoms,format,replace,create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageRichText=api;
})();
