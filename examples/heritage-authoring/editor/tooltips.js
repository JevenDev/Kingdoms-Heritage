'use strict';
globalThis.HeritageTooltips={setup({font,sprite,screen='intro'}) {
  if(document.getElementById('minecraft-tooltip'))return;
  const shared={
    undo:['Undo','Ctrl+Z. Revert the last edit.'],
    redo:['Redo','Ctrl+Y or Ctrl+Shift+Z. Restore an undone edit.'],
    'format-json':['Format JSON','Indent JSON without changing its values.'],
    format:['Format JSON','Indent JSON without changing its values.'],
    'json-tab':['Edit JSON','Edit the source directly. Extra fields are preserved.'],
    'author-use-another':['Use and create another','Connect this draft, then start a new one.'],
    'author-preview-pack':['Use and preview pack','Connect this draft and open the pack preview.'],
    'use-in-pack':['Use in pack','Connect this draft to the selected location.'],
    'delete-kit':['Delete saved kit','Delete the library draft. Existing packs will need a replacement.'],
    'delete-intro':['Delete saved intro','Delete the library draft. Existing packs will need a replacement.']
  };
  const descriptions={...shared,...(screen==='kit'?{
    copy:['Copy JSON','Copy the whole kit, including components and extra fields.'],
    'select-slots':['Select slots','Ctrl-click selects slots. Shift-click selects a range.'],
    'select-all-slots':['Select all items','Includes hidden, cosmetic and pending slot edits.'],
    'clear-inventory':['Clear kit inventory','Clears every inventory, held stack and pending edit.'],
    'fill-stack':['Max stack','Fill this stack to the item’s limit.'],
    'set-start':['Start here','Select this hotbar slot when the player starts.'],
    'copy-slot':['Copy slot','Copy the item, count and components.'],
    'paste-slot':['Paste slot','Place the copied stack here, merging compatible items.'],
    'configure-slots':['Slot layout','Match preview slots to your modpack. Preview only.'],
    'reset-slot-layout':['Use mod defaults','Replace this preview layout with the bundled mod defaults.'],
    'show-cosmetics':['Cosmetic slots','Edit appearance slots separately from equipped items.'],
    'revert-slot':['Revert edits','Discard unapplied ID and component edits for this slot.'],
    'discard-drafts':['Discard edits','Discard unapplied edits in every slot.'],
    'return-carried':['Return held item','Return the held stack to the inventory. Escape also returns it.'],
    'apply-components':['Apply components','Replace this item’s component data with the edited JSON.'],
    'apply-properties':['Apply properties','Save these properties to the selected item.'],
    'ignore-stack-limits':['Ignore stack limit','Allow this stack to exceed the item’s normal limit.'],
    'add-equipment':['Extra equipment slot','Add a named mod slot missing from the preview.'],
    'restore':['Restore valid JSON','Replace invalid JSON with the last valid version.']
  }:screen==='pack'?{
    'pack-undo':['Undo pack edit','Ctrl+Z. Includes locations, assignments and shared draft edits.'],
    'pack-redo':['Redo pack edit','Ctrl+Y or Ctrl+Shift+Z.'],
    'pack-checkpoints':['Checkpoints','Save or restore a named version of this pack.'],
    'resume-preview':['Resume preview','Return to your previous test choices.'],
    'close-embedded-editor':['Done editing','Save the draft and return to this location.'],
    'select-locations':['Select locations','Choose locations for bulk changes.'],
    'bulk-assign-kits':['Assign kits','Replace the kit choices for all selected locations.'],
    'bulk-assign-intro':['Assign intro','Replace default intros. Place overrides stay unchanged.'],
    'make-local-copy':['Make a local copy','Edit this location’s copy without changing other locations.'],
    'use-spawn-settings':['Use saved location','Also replace this location’s destination settings.'],
    'card-description-toggle':['Card description','Expand or collapse the card’s in-game description.'],
    'pack-try-flow':['Preview full flow','Play cards, kit selection and arrival in sequence.'],
    'location-try-flow':['Preview full flow','Play cards, kit selection and arrival in sequence.'],
    'preview-flow':['Preview full flow','Play cards, kit selection and arrival in sequence.'],
    'pack-kit-preview':['Kit preview','Inventory shows the full kit. Model only enlarges the equipped player in kit selection and confirmation.'],
    'pack-preview-resolution':['Preview resolution','Match the game window. Preview only.'],
    'location-preview-resolution':['Preview resolution','Match the game window. Preview only.'],
    'crop-reset':['Reset framing','Reset position and zoom. Keep the resolution setting.'],
    'crop-guides':['Thirds','Overlay a 3 × 3 framing grid. Preview only.'],
    'flow-sample-players':['Sample players','Add up to 20 simulated players. Open the Tab list to invite them and test party selection.'],
    'flow-player':['Player name','Used in the story review and for {player} in the arrival intro.'],
    'flow-biome':['Sample biome','Used for {biome} unless the destination specifies a single biome.'],
    'flow-structure':['Sample structure','Used for {structure} unless the destination specifies a single structure.'],
    'flow-pool':['Pool destination','Force a destination for this test. Export is unchanged.'],
    'flow-inventory-mode':['Inventory preview','Curios and Accessories show their equipment slots in the kit preview.'],
    'flow-scale':['Preview GUI scale','Used when the pack does not lock GUI scale.'],
    'flow-edit-location':['Edit location','Leave the preview and keep your test choices.'],
    'flow-edit-kit':['Edit kit','Leave the preview and keep your test choices.'],
    'flow-edit-intro':['Edit intro','Leave the preview and keep your test choices.'],
    copy:['Copy JSON','Copy only the file shown in the inspector.']
  }:{
    copy:['Copy JSON','Copy the source, including extra fields.'],
    'restore-json':['Restore valid JSON','Replace invalid JSON with the last valid version.'],
    'intro-name':['Intro name','Library name only. Not shown in game.'],
    effect:['Text effect',''],
    'apply-effect':['Apply effect','Style the selection, or the whole field if none.'],
    color:['Text color','Also sets the gradient’s starting color.'],
    'apply-color':['Apply color','Color the selection, or the whole field if none.'],
    'apply-gradient':['Apply gradient','Blend both colors across the selection, or the whole field.'],
    resolution:['Preview resolution','Match the game window. Preview only.'],
    viewport:['Preview GUI scale','Match Minecraft’s GUI scale. Preview only.'],
    background:['Preview background','Change the preview backdrop. Export is unchanged.'],
    timeline:['Scrub intro','Choose a point in the intro and pause playback.'],
    'new-angle':['New angle','Try another angle. In-game angles are random.'],
    'bar-height-range':['Bar thickness','GUI pixels per bar. Text placement stays independent.'],
    'text-mode-markup':['Markup','Edit style, context and pacing tags directly.'],
    'title-custom':['Custom title coordinates','Position the text anchor as a percentage of the screen.'],
    'subtitle-custom':['Custom subtitle coordinates','Position the text anchor as a percentage of the screen.'],
    'show-text-boxes':['Text boxes','Show draggable text bounds. Preview only.'],
    'move-title':['Move title','Drag the title or use arrow keys. Shift moves farther.'],
    'move-subtitle':['Move subtitle','Drag the subtitle or use arrow keys. Shift moves farther.'],
    mute:['Preview sound','Mute this preview. Exported sound settings stay unchanged.']
  })};
  const fields={
    title:['Larger title','Use 1.5× text size, reduced as needed to fit.'],
    large_subtitle:['Larger subtitle','Use 1.5× text size, reduced as needed to fit.'],
    subtitle_position:['Subtitle position','Matching the title’s position places the subtitle below it.'],
    control:['Player control','Choose when the player can move during arrival.'],
    blip:['Dialogue blips','Play sounds as text appears. Preview mute is separate.'],
    bar_height:['Bar thickness','GUI pixels per bar, capped at ¼ screen height. Text stays independent.'],
    black_hold_ticks:['Black screen','Delay before the world fades in. 20 ticks = 1 second.'],
    fade_from_black_ticks:['World fade','World and visible HUD fade-in time. 20 ticks = 1 second.'],
    reveal_ticks:['Text reveal','Base reveal time. Inline pauses and speed changes adjust the actual duration. 20 ticks = 1 second.'],
    hold_ticks:['Text hold','Time with the full message visible. 20 ticks = 1 second.'],
    fade_out_ticks:['Text fade out','Text fade-out time. 20 ticks = 1 second.'],
    bar_transition_ticks:['Bar movement','Time to enter or exit. 20 ticks = 1 second.']
  };
  const effects={wave:'Move letters in a wave.',shake:'Shake letters.',pulse:'Brighten and dim text.',jump:'Jump letters in sequence.',rainbow:'Cycle through rainbow colors.',strike:'Draw a line through text.',obfuscated:'Display changing random characters.'};
  const dynamic=[
    ['#component-details > summary',['Item components','Edit Minecraft component JSON for this item.']],
    ['.author-shared-context > button',['Make a local copy','Edit this location’s copy without changing other locations.']],
    ['[data-wrap]',['Text style','Style the selection, or the whole field if none.']],
    ['[data-token]',['Insert dialogue tag','Insert a context value or a pacing cue at the cursor.']],
    ['[data-lore-format],[data-lore-apply-color]',['Style lore','Style the selection, or the entire lore line if none.']],
    ['[data-item-property=damage]',['Damage used','Durability already consumed. Zero means fully repaired.']],
    ['[data-item-property=glint]',['Enchantment glint','Override the visual shimmer without adding enchantments.']],
    ['[data-preview-kit]',['Preview kit','Show this kit in the player view.']],
    ['[data-checkpoint-action=restore]',['Restore checkpoint','Restore this pack’s saved locations, kits and intros.']],
    ['[data-try-path]',['Try path','Test this location, kit and destination combination.']],
    ['[data-include-allowed-kit]',['Include kit','Enable this kit in the pack and this location.']]
  ];
  function attach(control,description) {
    if(!control||!description) return;
    const target=control.closest('label')||control;
    if(!target.dataset.tooltip)target.dataset.tooltip=JSON.stringify(description);
    target.setAttribute('title','');control.setAttribute('title','');
  }
  for(const [id,description] of Object.entries(descriptions)) attach(document.getElementById(id),description);
  for(const control of document.querySelectorAll('[data-field]')) attach(control,fields[control.dataset.field]);
  for(const control of document.querySelectorAll('[data-wrap]'))attach(control,[control.getAttribute('aria-label')||control.textContent.trim(),'Style the selection, or the whole field if none.']);
  for(const control of document.querySelectorAll('[data-token]'))attach(control,['Insert '+control.dataset.token,control.dataset.token.startsWith('pause')?'Pause the reveal in milliseconds.':control.dataset.token.startsWith('speed')?'Change the reveal speed multiplier.':'Use the player’s dialogue context in game.']);
  const tooltip=document.createElement('div'),canvas=document.createElement('canvas'),description=document.createElement('span');
  tooltip.id='minecraft-tooltip';tooltip.role='tooltip';tooltip.setAttribute('popover','manual');tooltip.hidden=true;
  description.className='sr-only';canvas.setAttribute('aria-hidden','true');
  tooltip.append(canvas,description);document.body.append(tooltip);
  let target=null,focusTarget=null,timer=null,point=null;
  function hide() {
    clearTimeout(timer);if(tooltip.matches(':popover-open'))tooltip.hidePopover();tooltip.hidden=true;
    if(focusTarget) {
      const ids=(focusTarget.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==tooltip.id);
      if(ids.length) focusTarget.setAttribute('aria-describedby',ids.join(' '));
      else focusTarget.removeAttribute('aria-describedby');
    }
    target=null;focusTarget=null;
  }
  function position() {
    const bounds=target.getBoundingClientRect(),width=tooltip.offsetWidth,height=tooltip.offsetHeight;
    let x=point?point.x+12:bounds.right+12,y=point?point.y-12:bounds.top;
    if(x+width>innerWidth-6) x=point?point.x-width-12:bounds.left-width-12;
    if(y+height>innerHeight-6) y=innerHeight-height-6;
    tooltip.style.left=Math.max(6,x)+'px';tooltip.style.top=Math.max(6,y)+'px';
  }
  function customTarget(node,owner){
    for(let current=node;current;current=current.parentElement){current.setAttribute('title','');if(current===owner)break;}
    return owner;
  }
  function resolve(node){
    const control=node.closest('button,a,input,select,textarea,summary'),explicit=node.closest('[data-tooltip]');if(explicit&&(!control||control===explicit||explicit.tagName==='LABEL'&&explicit.contains(control)))return customTarget(node,explicit);
    if(!control)return null;
    const rule=dynamic.find(([selector])=>control.matches(selector));if(!rule)return null;
    attach(control,rule[1]);return customTarget(node,control.closest('[data-tooltip]'));
  }
  function render() {
    let [title,body]=JSON.parse(target.dataset.tooltip);
    if(target.id==='effect') body=effects[target.value];
    const maxWidth=Math.max(40,Math.min(164,Math.floor((innerWidth-28)/2)));
    const glyph=ch=>font.get(ch)||font.get('?');
    const width=text=>Array.from(text).reduce((sum,ch)=>sum+glyph(ch).advance,0);
    const lines=[];
    for(const [text,color] of [[title,0xffffff],[body,0xaaaaaa]]) {
      let line='';
      for(const word of text.split(' ')) {
        if(line&&width(line+' '+word)>maxWidth) {lines.push({text:line,color});line='';}
        for(const ch of (line?' ':'')+word) {
          if(line&&width(line+ch)>maxWidth) {lines.push({text:line,color});line='';}
          line+=ch;
        }
      }
      lines.push({text:line,color});
    }
    const w=Math.max(...lines.map(line=>width(line.text)))+8,h=lines.length*10+6;
    canvas.width=w*2;canvas.height=h*2;
    const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#100010f0';
    ctx.fillRect(1,0,w-2,h);ctx.fillRect(0,1,w,h-2);
    const border=ctx.createLinearGradient(0,1,0,h-1);
    border.addColorStop(0,'#5000ff50');border.addColorStop(1,'#28007f50');
    ctx.fillStyle=border;ctx.fillRect(1,1,w-2,1);ctx.fillRect(1,h-2,w-2,1);ctx.fillRect(1,2,1,h-4);ctx.fillRect(w-2,2,1,h-4);
    lines.forEach((line,i)=>{
      let x=4;
      for(const ch of line.text) {
        const g=glyph(ch),y=4+i*10+7-g.ascent;
        for(const [offset,color] of [[1,(line.color&0xfcfcfc)>>2],[0,line.color]]) {
          const image=sprite(g,color);
          ctx.drawImage(image,x+offset,y+offset,g.sw*g.scale,g.sh*g.scale);
        }
        x+=g.advance;
      }
    });
    description.textContent=title+'. '+body;
  }
  function show(element,event,focus=false) {
    hide();target=element;point=focus?null:{x:event.clientX,y:event.clientY};
    if(focus) {
      focusTarget=event.target;
      focusTarget.setAttribute('aria-describedby',((focusTarget.getAttribute('aria-describedby')||'')+' '+tooltip.id).trim());
    }
    timer=setTimeout(()=>{if(!target?.isConnected||!target.checkVisibility()){hide();return;}render();tooltip.hidden=false;tooltip.showPopover();position();},focus?0:300);
  }
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch') return;
    const element=resolve(event.target);
    if(!element)hide();else if(element!==target)show(element,event);
  });
  document.addEventListener('pointermove',event=>{if(target&&point){point={x:event.clientX,y:event.clientY};if(!tooltip.hidden)position();}});
  document.addEventListener('pointerout',event=>{if(target&&point&&!target.contains(event.relatedTarget))hide();});
  document.addEventListener('focusin',event=>{const element=resolve(event.target);if(element)show(element,event,true);});
  document.addEventListener('focusout',hide);
  document.addEventListener('change',event=>{if(target?.contains(event.target)&&!tooltip.hidden){if(!target.checkVisibility()){hide();return;}render();position();}});
  document.addEventListener('pointerdown',hide);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  document.addEventListener('scroll',()=>{if(target&&!point&&target.checkVisibility()){if(!tooltip.hidden)position();}else hide();},true);
  window.addEventListener('resize',hide);window.addEventListener('blur',hide);document.addEventListener('visibilitychange',hide);
}};
