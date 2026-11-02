(() => {
'use strict';
function create(config){
  const $=id=>document.getElementById(id),toolbar=document.querySelector('.author-content > .document-toolbar'),actions=toolbar.querySelector('.document-actions-menu'),history=document.createElement('div');history.className='intro-history-actions';history.setAttribute('role','group');history.setAttribute('aria-label','Intro history');history.append($('undo'),$('redo'));actions.before(history);actions.querySelector('.document-file-actions').prepend($('json-tab'));
  toolbar.append(document.querySelector('.author-footer'));
  const inspector=document.querySelector('.authoring'),tabs=document.querySelector('.author-steps'),inspectorHeading=document.createElement('h3');inspectorHeading.textContent='Inspector';inspectorHeading.className='inspector-heading';tabs.setAttribute('aria-label','Intro properties');inspector.prepend(inspectorHeading,tabs);document.querySelector('.workspace').prepend(document.querySelector('.preview-column'));
  const playback=document.querySelectorAll('#appearance-panel > fieldset')[1];playback.classList.add('intro-playback-properties');document.querySelector('#bars-panel').prepend(playback);
  const timingHint=document.querySelector('#timing-panel fieldset > .hint'),timingUnits=document.createElement('span');timingUnits.className='timing-units';timingUnits.textContent=timingHint.textContent;document.querySelector('#timing-panel legend').append(timingUnits);timingHint.remove();
  const heading=document.createElement('div');heading.className='preview-heading';const title=document.querySelector('.preview-pane > h3');title.before(heading);heading.append(title);
  function panel(id,label,source){
    const dialog=document.createElement('dialog'),top=document.createElement('div'),title=document.createElement('h2'),close=document.createElement('button'),button=document.createElement('button'),body=document.createElement('div');dialog.id=id;dialog.className='intro-settings-dialog';dialog.setAttribute('aria-labelledby',id+'-heading');top.className='intro-dialog-heading';title.id=id+'-heading';title.textContent=label;close.type=button.type='button';close.textContent='Close';button.textContent=label;button.id=id+'-toggle';body.className=source.className;
    for(const node of [...source.childNodes])if(node.nodeName!=='SUMMARY')body.append(node);source.remove();top.append(title,close);dialog.append(top,body);document.body.append(dialog);close.addEventListener('click',()=>dialog.close());button.addEventListener('click',()=>dialog.showModal());return {dialog,button,body};
  }
  const setup=panel('intro-preview-settings','Preview settings',document.querySelector('.preview-setup'));heading.append(setup.button);
  const help=panel('intro-json-help','JSON help',document.querySelector('.editor-help'));actions.querySelector('.document-file-actions').append(help.button);
  const styles=panel('intro-text-styling','More styles',document.querySelector('.text-formatting')),mode=document.querySelector('.rich-text-mode > div');
  for(const button of styles.body.querySelectorAll('[data-wrap]')){const tag=button.dataset.wrap;button.textContent={bold:'B',italic:'I',underline:'U'}[tag];button.title=tag[0].toUpperCase()+tag.slice(1);button.setAttribute('aria-label',button.title);button.classList.add('inline-text-style');mode.insertBefore(button,$('text-mode-visual'));}
  mode.insertBefore(styles.button,$('text-mode-visual'));
  styles.dialog.addEventListener('click',event=>{if(event.target.closest('#apply-effect,#apply-color,#apply-gradient')){styles.dialog.close();config.textFocus();}});
  const monitor=document.createElement('div');monitor.className='intro-preview-monitor';$('preview').before(monitor);monitor.append($('preview'));monitor.after(document.querySelector('.playback'));
  const footer=document.querySelector('.preview-footer');heading.insertBefore($('phase'),setup.button);heading.insertBefore(footer.querySelector('label'),setup.button);heading.insertBefore(document.querySelector('.position-toolbar'),setup.button);heading.insertBefore($('pack-preview-scale'),setup.button);footer.remove();$('position-help').classList.add('sr-only');
  return {monitor,settings:setup.dialog,styles:styles.dialog,help:help.dialog};
}
globalThis.HeritageIntroLayout={create};
})();
