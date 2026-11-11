(() => {
'use strict';
document.body.insertAdjacentHTML('beforeend',`<dialog id="flow-dialog" aria-labelledby="flow-heading">
<div class="flow-toolbar"><h2 id="flow-heading">Selection flow preview</h2><span id="flow-phase" role="status"></span><details id="flow-edit-menu" class="entry-actions-menu" data-default-closed hidden><summary>Edit this choice</summary><div class="document-file-actions"><button id="flow-edit-location" type="button">Edit location</button><button id="flow-edit-kit" type="button">Edit kit</button><button id="flow-edit-intro" type="button">Edit intro</button></div></details><button id="flow-restart" type="button">Restart</button><label class="check"><input id="flow-mute" type="checkbox"> Mute</label><button id="flow-fullscreen" type="button">Full screen</button><button id="flow-close" type="button">Close preview</button></div>
<details class="flow-settings"><summary>Preview settings</summary><div class="flow-settings-fields">
<label class="stack" data-flow-only>Sample players<input id="flow-sample-players" type="number" min="0" max="20" value="0"></label>
<label class="stack" data-flow-only>Player name<input id="flow-player" value="Player" maxlength="16"></label>
<label class="stack">Resolution<select id="flow-resolution"><option value="1920x1080">1920 × 1080</option><option value="1280x720">1280 × 720</option><option value="1024x768">1024 × 768</option></select></label>
<label class="stack">GUI scale<select id="flow-scale" aria-describedby="flow-scale-status"><option value="0">Auto</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4" selected>4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="13">13</option><option value="14">14</option><option value="15">15</option><option value="16">16</option></select></label>
<label class="stack" data-flow-only>Inventory<select id="flow-inventory-mode"><option value="player">Vanilla</option><option value="curios">Curios</option><option value="accessories">Accessories</option></select></label>
<label class="stack" data-flow-only>Sample biome<input id="flow-biome" value="Plains"></label>
<label class="stack" data-flow-only>Sample structure<input id="flow-structure" value="Wilderness"></label>
<label class="stack" data-flow-only>Pool destination<select id="flow-pool" disabled><option value="random">Random</option></select></label>
</div><p id="flow-scale-status" class="hint" role="status"></p></details><div class="flow-sample-actions"><button id="flow-sample-accept" type="button" hidden>Simulate accepting the invite</button><button id="flow-sample-ready" type="button" hidden>Mark sample player ready</button></div>
<p id="flow-target" class="hint" hidden></p><p class="flow-help hint" data-flow-only>Add sample players in Preview settings to test the party flow. Check terrain, multiplayer and mod screens in Minecraft.</p>
<div id="flow-stage" class="flow-stage"><div id="flow-screen"><canvas id="flow-canvas" aria-hidden="true"></canvas><div id="flow-inventory" hidden></div><div id="flow-controls" role="group" aria-label="Selection screen controls"></div>
<div id="flow-party-controls" role="group" aria-label="Player list controls"></div></div></div>
<p id="flow-narration" class="sr-only" aria-live="polite"></p>
<p id="flow-status" class="hint" role="status"></p>
</dialog>`);
})();
