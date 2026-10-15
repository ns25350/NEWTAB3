/* Cupertino Pane gestures inside a native dialog keep focus trapping and Escape. */
(function(){
'use strict';
let active=null,refreshFrame=0;
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const content=document.querySelector('#sheet-content');
const grabber=document.querySelector('#sheet-grabber');
function geometry(dialog){
 const viewport=window.visualViewport;
 const height=viewport?Math.min(innerHeight,viewport.height):innerHeight;
 const compact=innerWidth<700;
 const offset=Math.max(0,innerHeight-height-(viewport?.offsetTop||0))+(compact?0:24);
 const limit=Math.max(180,height-(compact?28:64));
 const top=Math.min(limit,dialog.classList.contains('confirmation-mode')?380:dialog.classList.contains('settings-mode')?800:680);
 return {offset,breaks:{top:{enabled:true,height:top},middle:{enabled:!dialog.classList.contains('confirmation-mode'),height:Math.max(100,Math.min(top*.68,520))},bottom:{enabled:true,height:0}}};
}
function visibleHeight(record,y){
 if(!record||active!==record)return;
 const height=record.pane.getPaneHeight();
 const shown=Math.min(height,Math.max(0,innerHeight-(y??record.pane.getPanelTransformY())-record.pane.settings.bottomOffset));
 content.style.setProperty('--pane-visible-height',shown+'px');
}
function restoreContent(){
 content.style.removeProperty('display');content.style.removeProperty('height');
 content.style.removeProperty('overflow-x');content.style.removeProperty('overflow-y');
 content.style.removeProperty('overscroll-behavior');content.style.removeProperty('transition');
 content.style.removeProperty('--pane-visible-height');
}
function cleanup(dialog){
 const record=active;if(!record||record.dialog!==dialog)return;
 active=null;dialog.removeAttribute('data-pane-ready');
 if(record.pane.rendered)record.pane.destroy({animate:false});
 restoreContent();
}
async function mount(dialog){
 if(!dialog.open||active)return;
 if(!window.CupertinoPane){dialog.classList.remove('pane-host');return;}
 const config=geometry(dialog),record={dialog,pane:null,dragged:false};
 const focused=dialog.contains(document.activeElement)?document.activeElement:dialog.querySelector('.close-dialog');
 const pane=new CupertinoPane(content,{
  parentElement:dialog,cssClass:'newtab-pane',modules:[],
  initialBreak:'top',breaks:config.breaks,bottomOffset:config.offset,
  bottomClose:true,fastSwipeClose:true,buttonDestroy:false,showDraggable:false,
  dragBy:['#sheet-grabber'],topperOverflow:false,preventClicks:false,
  handleKeyboard:false,passiveListeners:false,
  animationDuration:motion.matches?0:340,animationType:'cubic-bezier(.22,.85,.24,1)',
  events:{
   onDragStart:()=>{record.dragged=false;},
   onDrag:()=>{record.dragged=true;visibleHeight(record);},
   onTransitionStart:event=>visibleHeight(record,event?.translateY?.new),
   onTransitionEnd:()=>visibleHeight(record),
   onDidDismiss:()=>{if(active===record){active=null;restoreContent();if(dialog.open)dialog.close();dialog.removeAttribute('data-pane-ready');}}
  }
 });
 record.pane=pane;active=record;
 try{
  await pane.present({animate:!motion.matches});
  if(active!==record||!dialog.open){if(pane.rendered)await pane.destroy({animate:false});if(!active)restoreContent();return;}
  dialog.dataset.paneReady='true';visibleHeight(record);focused?.focus({preventScroll:true});
 }catch(error){
  if(active===record)cleanup(dialog);dialog.classList.remove('pane-host');console.error('Drawer could not open',error);
 }
}
function refresh(){
 cancelAnimationFrame(refreshFrame);
 refreshFrame=requestAnimationFrame(()=>requestAnimationFrame(async()=>{
  const record=active;if(!record||!record.dialog.open||!record.pane.rendered)return;
  const config=geometry(record.dialog),current=record.pane.currentBreak()||'top';
  record.pane.settings.animationDuration=motion.matches?0:340;
  await record.pane.setBreakpoints(config.breaks,config.offset);
  if(active!==record)return;
  const next=current==='middle'&&config.breaks.middle.enabled?'middle':'top';
  await record.pane.moveToBreak(next,'move');visibleHeight(record);
 }));
}
function present(dialog){
 if(dialog.open){refresh();return;}
 dialog.classList.add('pane-host');dialog.showModal();queueMicrotask(()=>mount(dialog));
}
function close(dialog){if(dialog.open)dialog.close();cleanup(dialog);}
grabber.addEventListener('pointerdown',event=>{if(event.button===0)grabber.setPointerCapture(event.pointerId);});
const dialog=document.querySelector('#sheet');
dialog.addEventListener('close',()=>cleanup(dialog));
dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.classList.contains('cupertino-pane-wrapper'))close(dialog);});
grabber.addEventListener('keydown',event=>{
 if(!active||!['ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))return;
 event.preventDefault();const pane=active.pane;
 if(event.key==='End'){close(dialog);return;}
 const target=event.key==='ArrowUp'||event.key==='Home'?'top':event.key==='ArrowDown'?'middle':pane.currentBreak()==='top'?'middle':'top';
 if(pane.settings.breaks[target].enabled)pane.moveToBreak(target);
});
grabber.addEventListener('click',()=>{
 if(!active||active.dragged)return;
 const pane=active.pane,target=pane.currentBreak()==='top'?'middle':'top';
 if(pane.settings.breaks[target].enabled)pane.moveToBreak(target);
});
window.addEventListener('resize',refresh);window.visualViewport?.addEventListener('resize',refresh);
motion.addEventListener('change',refresh);
window.NewTabDrawer={present,close,refresh};
})();
