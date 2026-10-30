'use strict';
globalThis.HeritageTooltips={setup({font,sprite,screen='intro'}) {
  const shared={
    undo:['Undo','Ctrl+Z.'],
    redo:['Redo','Ctrl+Y or Ctrl+Shift+Z.'],
    'format-json':['Format JSON','Tidy the spacing and indentation.'],
    format:['Format JSON','Tidy the spacing and indentation.']
  };
  const descriptions={...shared,...(screen==='kit'?{
    'json-tab':['JSON','Edit the kit directly.'],
    copy:['Copy JSON','Copy the whole kit, including item data and extra fields.'],
    'kit-drafts':['Open kit','Each kit keeps its own edits and undo history.'],
    'new-kit':['New kit','Start a new kit. Your other kits stay open.'],
    example:['Example kit','Open an example as a new kit.'],
    import:['Import JSON','Open a JSON file as a new kit.'],
    'select-slots':['Select slots','Ctrl/Cmd-click to select slots. In selection mode, Shift-click selects a range.'],
    'select-all-slots':['Select all items','Select items in every inventory, including hidden and cosmetic slots.'],
    'delete-selected':['Delete selected','Custom or modified items ask for confirmation.'],
    'clear-inventory':['Clear kit inventory','Clear every slot, held item, and pending edit.'],
    'fill-stack':['Max stack','Fill the stack to the item’s limit.'],
    'set-start':['Starting hotbar slot','Start with this hotbar slot selected.'],
    'copy-slot':['Copy slot','Copy the item, count, and components.'],
    'paste-slot':['Paste slot','Paste the copied item into this slot.'],
    'item-category':['Item filter','Choose In this kit to show its vanilla items.'],
    'configure-slots':['Slot layout','Match slot names and counts to your modpack.']
  }:{
    'json-tab':['JSON','Paste intro JSON or a full spawn file.'],
    'text-tab':['Text & styling','Edit the text, colors, and effects.'],
    copy:['Copy JSON','Copy your JSON, keeping extra fields.'],
    'restore-json':['Restore valid JSON','Replace the invalid JSON with the last valid version.'],
    'intro-drafts':['Open intro','Each intro keeps its own edits and undo history.'],
    'intro-name':['Intro name','Name this draft for the intro list. This is not exported.'],
    'new-intro':['New intro','Start a new intro. Your other intros stay open.'],
    preset:['Example intro','Open an example as a new intro.'],
    effect:['Text effect',''],
    'apply-effect':['Apply effect','Style selected text, or the whole field if nothing is selected.'],
    color:['Text color','Also used as the first gradient color.'],
    'apply-color':['Apply color','Color selected text, or the whole field if nothing is selected.'],
    'apply-gradient':['Apply gradient','Blend the two colors across selected text, or the whole field.'],
    viewport:['GUI size','Change text wrapping in the preview. This is not exported.'],
    background:['Preview background','Only changes the preview.'],
    timeline:['Timeline','Drag to choose a point in the intro. This pauses playback.'],
    'new-angle':['New angle','Try another angle. In-game angles are random.'],
    biome:['Sample biome','Preview <biome> with this name.'],
    structure:['Sample structure','Preview <structure> with this name.'],
    dimension:['Sample dimension','Preview <dimension> with this name.'],
    'timing-tab':['Timing','20 ticks = 1 second.'],
    'locations-tab':['Sample locations','Try sample names for location tags. These are not exported.']
  })};
  const fields={
    text:['Main text','Supports style tags, location tags, and line breaks.'],
    subtitle:['Subtitle','Optional second message. Style and position it separately.'],
    title:['Larger title','1.5 times the normal size. Shrinks to fit if needed.'],
    subtitle_position:['Subtitle position','Choose the same position as the title to place the subtitle below it.'],
    blip:['Dialogue blips','Play a blip as text appears. Muting the preview does not turn this off.'],
    black_hold_ticks:['Black screen','Time on a black screen before the intro. 20 ticks = 1 second.'],
    fade_from_black_ticks:['World fade','Time for the world and visible HUD to fade in, in ticks.'],
    reveal_ticks:['Text reveal duration','Time for the text to appear, in ticks.'],
    hold_ticks:['Text hold','Time the full message stays visible, in ticks.'],
    fade_out_ticks:['Text fade out','Time for the text to fade out, in ticks.'],
    bar_transition_ticks:['Bar movement','Time for the bars to move in or out, in ticks.']
  };
  const effects={wave:'Move letters in a wave.',shake:'Make the letters shake.',pulse:'Make text brighten and dim.',jump:'Make letters jump one after another.',rainbow:'Cycle text through rainbow colors.',strike:'Draw a line through the text.',obfuscated:'Show changing random characters.'};
  function attach(control,description) {
    if(!control||!description) return;
    const target=control.closest('label')||control;
    target.dataset.tooltip=JSON.stringify(description);
    control.removeAttribute('title');
  }
  for(const [id,description] of Object.entries(descriptions)) attach(document.getElementById(id),description);
  for(const control of document.querySelectorAll('[data-field]')) attach(control,fields[control.dataset.field]);
  for(const control of document.querySelectorAll('[data-wrap]')) attach(control,[control.textContent.trim(),'Style selected text, or the whole field if nothing is selected.']);
  for(const control of document.querySelectorAll('[data-token]')) attach(control,['Insert '+control.dataset.token,'Use the '+control.dataset.token+' name at the player’s spawn.']);
  const navigation={
    'gallery.html':['Intro editor','Create and preview spawn intros.'],
    'kit-editor.html':['Kit creator','Build starter kits and choose inventory slots.'],
    'docs.html':['Documentation','Pack setup, fields, and examples.'],
    'docs.html#/kits':['Documentation','Pack setup, fields, and examples.'],
    'docs.html#/text-styles':['Style examples','Preview text styles, colors, and effects.']
  };
  for(const link of document.querySelectorAll('header nav a'))attach(link,navigation[link.getAttribute('href')]);
  attach(document.querySelector('header .home-link'),['Home','Open the Heritage pack tools.']);
  if(screen==='kit')attach(document.querySelector('#component-details summary'),['Item components','Click Apply components to update the kit.']);
  const tooltip=document.createElement('div'),canvas=document.createElement('canvas'),description=document.createElement('span');
  tooltip.id='minecraft-tooltip';tooltip.role='tooltip';tooltip.hidden=true;
  description.className='sr-only';canvas.setAttribute('aria-hidden','true');
  tooltip.append(canvas,description);document.body.append(tooltip);
  let target=null,focusTarget=null,timer=null,point=null;
  function hide() {
    clearTimeout(timer);tooltip.hidden=true;
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
    timer=setTimeout(()=>{render();tooltip.hidden=false;position();},focus?0:300);
  }
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch') return;
    const element=event.target.closest('[data-tooltip]');
    if(!element)hide();else if(element!==target)show(element,event);
  });
  document.addEventListener('pointermove',event=>{if(target&&point){point={x:event.clientX,y:event.clientY};if(!tooltip.hidden)position();}});
  document.addEventListener('pointerout',event=>{if(target&&point&&!target.contains(event.relatedTarget))hide();});
  document.addEventListener('focusin',event=>{const element=event.target.closest('[data-tooltip]');if(element)show(element,event,true);});
  document.addEventListener('focusout',hide);
  document.addEventListener('pointerdown',hide);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  document.addEventListener('scroll',hide,true);
  window.addEventListener('resize',hide);
}};
