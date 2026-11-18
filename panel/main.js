"use strict";(()=>{var T="openchamber.sdk";var Ne="data-oc-scrolling",tt=`
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${Ne}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${Ne}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${Ne}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${Ne}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;function ot(e){let o=e.documentElement;if(o.hasAttribute("data-oc-scrollbar-activity"))return;o.setAttribute("data-oc-scrollbar-activity","");let n=new WeakMap;e.addEventListener("scroll",i=>{let d=i.target===e?o:i.target;if(!(d instanceof Element))return;d.hasAttribute("data-oc-scrolling")||d.setAttribute("data-oc-scrolling","");let _=n.get(d);_!==void 0&&clearTimeout(_),n.set(d,setTimeout(()=>{n.delete(d),d.removeAttribute("data-oc-scrolling")},1e3))},{capture:!0,passive:!0})}var gr=`(${ot.toString()})(document);`;var lo=e=>{let o=[],n=0,i=0;return{push:d=>{for(o.push(d),i+=d.length;i-n>e&&o.length>1;){let _=o.shift();i-=_?.length??0,n=0}},pull:d=>{let _=0;for(;_<d.length&&o.length>0;){let f=o[0],h=Math.min(d.length-_,f.length-n);d.set(f.subarray(n,n+h),_),_+=h,n+=h,n>=f.length&&(o.shift(),i-=f.length,n=0)}d.fill(0,_)},clear:()=>{o.length=0,n=0,i=0},get size(){return i-n}}};var Eo=/^[a-z][a-z0-9-]{0,39}$/;var po=e=>Object(e)===e&&!Array.isArray(e),rt=(e,o)=>Object.keys(e).every(n=>o.includes(n)),uo=e=>String(e)===e&&e.length>=1&&e.length<=60,_o=e=>String(e)===e&&e.length>=1&&e.length<=80,To=e=>{if(!Array.isArray(e)||e.length>4)return!1;let o=new Set;for(let n of e){if(!po(n)||!Eo.test(n.id)||!uo(n.label)||n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1||o.has(n.id))return!1;if(o.add(n.id),n.kind==="button"){if(!rt(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!rt(n,["kind","id","label","value","options","disabled"])||!_o(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let i=new Set;for(let d of n.options){if(!po(d)||!rt(d,["value","label"])||!_o(d.value)||!uo(d.label)||i.has(d.value))return!1;i.add(d.value)}if(!i.has(n.value))return!1}return!0};var Or=1024*1024;var So=["{id}","{segment}","{segments+}"];var En=new Set(So);var fo=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Sn=new Set(fo);var nt=e=>"bytes"in e?e.bytes.byteLength:e.content.length,Ao=(e,o)=>{if(e.path!==o.path||e.readOnly!==o.readOnly)return!1;if(e.encoding==="text"||o.encoding==="text")return e.encoding==="text"&&o.encoding==="text"&&e.content===o.content;if(e.bytes.byteLength!==o.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==o.bytes[n])return!1;return!0};var ho=/^[A-Za-z0-9_-]{1,80}$/;var mo=["left","right","top","bottom"];var go=(e,o=0,n={remaining:16e3})=>{if(--n.remaining<0||o>=32)return!1;if(e===null)return!0;let i=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let d of i)if(!go(d,o+1,n))return!1;return!0},st=e=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every(o=>/^(0|[1-9]\d*)$/.test(o)&&Number(o)<e.length)&&e.every(st);if(Object(e)===e){let o=Object.getPrototypeOf(e);return(o===null||o===Object.prototype)&&Object.values(e).every(st)}return String(e)===e||Number.isFinite(e)},it=e=>{try{return String(e.id)!==e.id||!ho.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!mo.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!go(e.data)||!st(e.data)?!1:JSON.stringify(e.data).length<=16e3}catch{return!1}};var ct=2e3;var Oo=["file","directory","other","missing"],lt=e=>!!(e&&"sessionId"in e),dt=e=>!!(e&&"sent"in e&&!("sessionId"in e));var Ro=/^[0-9a-f]{7,64}$/i,pt=e=>Ro.test(e),we=500,Le=32e3,bo=16e3,ko=128,Io=200,yo=2e3,Co=16e3,Uo=80,vo=200,Mo=16e3;var No=2e3;var ut=2e4,Pe=1024,Ge=2e6;var De=64e3,$e=8e3,_t=4e3;var Et=96e4,Rr=60*6e4;var wo=999,Lo=1e4,ye=500,Po=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],Go=["stopped","starting","ready","failed"],br=new Set(Po),Do=e=>br.has(e),$o=e=>e&&Do(e)?e:"HOST_REJECTED",ge=e=>e===void 0?!1:e===null||e===!0||e===!1||String(e)===e?!0:Number(e)===e?Number.isFinite(e):Array.isArray(e)?e.every(ge):Object(e)===e?Object.values(e).every(ge):!1,Ho=e=>ge(e)&&JSON.stringify(e).length<=Mo,xo=e=>e?.trim().slice(0,vo)??"",xe=e=>{let o=e.id.trim().slice(0,ko),n=e.title.trim().slice(0,Io),i=e.url.trim().slice(0,yo),d=e.text?.trim().slice(0,Co),_=e.author?.trim().slice(0,Uo),f=e.kind==="pull"?"pull":"issue",h={providerId:e.providerId.trim(),id:o,title:n||o,url:i,kind:f};if(d&&(h.text=d),_&&(h.author=_),f==="pull"){let N=xo(e.branches?.head),Q=xo(e.branches?.base);N&&Q&&(h.branches={head:N,base:Q})}return Ho(e.data)&&(h.data=e.data),h},Tt=e=>{let o=xe(e);return e.projectId&&(o.projectId=e.projectId),e.navigation&&(o.navigation=e.navigation),e.worktree&&(o.worktree=e.worktree),o},St=e=>{let o={text:e.text.trim().slice(0,bo)};return e.send&&(o.send=!0),o},ft=e=>e===null||!Number.isFinite(e)?null:Math.min(wo,Math.max(0,Math.round(e))),At=e=>Number.isFinite(e)?Math.min(Lo,Math.max(0,Math.ceil(e))):0;var Oe=e=>e.length>0&&e.length<=Pe&&!e.includes("\0")&&!e.includes("\\");var He=e=>!e.startsWith("/")||e.includes("\0")||e.includes("\\")||e.includes("://")||e.length>No?!1:!e.split("/").some(n=>n==="."||n===".."),kr=new Set(Go),ht=e=>!!(e&&"status"in e&&kr.has(String(e.status))&&!("body"in e)),Xe=e=>!!(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),mt=e=>!!(e&&"content"in e&&String(e.content)===e.content),gt=e=>!!(e&&"written"in e&&e.written===!0),xt=e=>!!(e&&"entries"in e&&Array.isArray(e.entries)),Ir=new Set(Oo),Ot=e=>!!(e&&"kind"in e&&"size"in e&&Ir.has(String(e.kind))&&Number.isFinite(e.size)),Rt=e=>!!(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),yr=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),Cr=e=>Object(e)===e?e:null,at=e=>String(e)===e&&e.length>0,Ur=e=>{if(!at(e.id))return null;if(e.ok===!0){let o={channel:T,v:1,type:"result",id:e.id,ok:!0};return Object(e.payload)===e.payload&&(o.payload=e.payload),o}return e.ok===!1&&at(e.error)?{channel:T,v:1,type:"result",id:e.id,ok:!1,error:e.error,code:$o(at(e.code)?e.code:void 0)}:null},bt=e=>{let o=Cr(e);return!o||o.channel!==T||o.v!==1?null:o.type==="result"?Ur(o):!yr.has(String(o.type))||Object(o.payload)!==o.payload?null:o};var Xo=e=>"key"in e&&"metaKey"in e&&"ctrlKey"in e,vr=e=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s",u=class extends Error{code;constructor(o,n){super(n),this.name="HostRequestError",this.code=o}},Vo=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ve=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${Pe} characters without NUL or backslash.`)),Fe=e=>{if(e!==void 0){if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0}},E=e=>(e.value+=1,`oc-${e.value}`),Ut=(e={})=>{let o=e.target??("window"in globalThis?window:null);if(!o)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.acceptSource??(t=>t===o.parent),i=e.requestTimeoutMs??ut,d=new Set,_=new Set,f=new Set,h=new Set,N=new Set,Q=new Set,de=new Set,pe=new Set,ne=new Set,ue=new Set,_e=new Set,K=new Set,ee=[],z=null,te=null,se=new Set,O=new Set,q=null,H=null,ie=!1,J=new Map,ae=new Map,A=new Map,I=!1,p={value:0},a=null,y=null,Z=!1,Ie=!1,Yt=null,F=null,Qt=t=>t?{sessionId:t.id,phase:t.busy?"started":"completed"}:null,X=t=>{o.parent.postMessage(t,"*")},Zt=()=>{I||o.parent===o||K.size===0||a?.features?.lateGenerateResults!==!0||X({channel:T,v:1,type:"generate-late-listen"})},R=(t,r)=>{for(let l of t)try{l(r)}catch(c){console.error(c)}},eo=t=>{if(!(t instanceof MessageEvent)||!n(t.source))return;let r=bt(t.data);if(!r)return;if(r.type==="workspace"){let c=ae.get(r.payload.subscriptionId);c&&R([c],r.payload.snapshot);return}if(r.type==="shells"){let c=A.get(r.payload.subscriptionId);c&&R([c],r.payload.snapshot);return}if(r.type==="microphone-audio"){F?.queue.push(r.payload.samples);return}if(r.type==="microphone-ended"){let c=F;if(!c)return;F=null,c.release(),R(c.endedListeners,r.payload.reason);return}if(r.type==="ready"){a=r.payload,y=Qt(r.payload.session),R(d,r.payload),R(_,r.payload.directory),R(f,r.payload.session),y&&R(h,y),R(N,r.payload.connection),R(Q,r.payload.settings),R(de,r.payload.item),r.payload.block&&R(pe,r.payload.block),Zt();return}if(r.type==="service-event"){R(ne,r.payload);return}if(r.type==="generate-late"){K.size===0?ee.push(r.payload):R(K,r.payload);return}if(r.type==="directory"){a&&(a={...a,directory:r.payload.directory}),R(_,r.payload.directory);return}if(r.type==="session"){a&&(a={...a,session:r.payload.session}),r.payload.session?y?.sessionId!==r.payload.session.id&&(y=Qt(r.payload.session)):y=null,R(f,r.payload.session);return}if(r.type==="session-lifecycle"){y=r.payload,R(h,r.payload);return}if(r.type==="connection"){a&&(a={...a,connection:r.payload.connection}),R(N,r.payload.connection);return}if(r.type==="settings"){a&&(a={...a,settings:r.payload.settings}),R(Q,r.payload.settings);return}if(r.type==="item"){a&&(a={...a,item:r.payload.item}),R(de,r.payload.item);return}if(r.type==="status-control-event"){R(ue,r.payload);return}if(r.type==="popover-closed"){R(_e,r.payload);return}if(r.type==="action"){let c=g=>{I||X({channel:T,v:1,type:"action-result",id:r.id,payload:g})},m=te;if(!m){c({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>m(r.payload)).then(()=>c({ok:!0}),g=>{let b=(g instanceof Error?g.message:String(g)).trim();c({ok:!1,error:(b||"Action failed.").slice(0,ye)})});return}if(r.type==="file-open"){let c=r.payload;if(H&&Ao(H,c))return;H=c,R(se,r.payload);return}if(r.type==="file-saved"){R(O,r.payload.version);return}if(r.type==="file-snapshot"){let c=b=>{I||X({channel:T,v:1,type:"file-snapshot-result",id:r.id,payload:b})},m=b=>c({error:(b.trim()||"Could not read the edited file.").slice(0,ye)}),g=q;if(!g){m("This extension does not edit files.");return}Promise.resolve().then(()=>g(r.payload.purpose)).then(b=>{if(nt(b)>2e7){m(`The file is over ${2e7} ${"bytes"in b?"bytes":"characters"}.`);return}if(b.version.length>256){m(`The snapshot version is over ${256} characters.`);return}c({snapshot:"bytes"in b?{bytes:b.bytes,version:b.version}:{content:b.content,version:b.version}})},b=>m(b instanceof Error?b.message:String(b)));return}if(r.type==="resolve"){let c=g=>{X({channel:T,v:1,type:"resolve-result",id:r.id,payload:g})},m=z;if(!m){c({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>m(r.payload)).then(g=>c({item:g?xe(g):null}),g=>{let b=(g instanceof Error?g.message:String(g)).trim();c({error:(b||"Command failed.").slice(0,ye)})});return}let l=J.get(r.id);if(l){if(clearTimeout(l.timer),J.delete(r.id),r.ok){l.resolve(r.payload);return}l.reject(new u(r.code,r.error))}};o.addEventListener("message",eo),X({channel:T,v:1,type:"hello"});let D=(t,r=i)=>I||o.parent===o?Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe.")):new Promise((l,c)=>{let m=setTimeout(()=>{J.delete(t.id),c(new u("HOST_TIMEOUT","Host did not answer in time."))},r);J.set(t.id,{resolve:l,reject:c,timer:m}),X(t)}),M=t=>D(t).then(()=>{}),C={channel:T,v:1},Ye=t=>{!I&&o.parent!==o&&X(t)},to=()=>Ye({...C,type:"file-save"}),Qe=()=>{!I&&o.parent!==o&&X({...C,type:"microphone-close",id:E(p)})},hr=async()=>{if(F)throw new u("HOST_REJECTED","The microphone is already open in this frame.");if(a?.features?.microphone!==!0)throw new u("UNSUPPORTED","This OpenChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!="function")throw new u("UNSUPPORTED","This frame has no Web Audio.");let r=new t;if(r.sampleRate<8e3||r.sampleRate>192e3)throw r.close().catch(()=>{}),new u("UNSUPPORTED",`Audio at ${r.sampleRate} Hz is not supported.`);let l=r.state==="suspended"?r.resume().catch(()=>{}):void 0,c=lo(Math.round(r.sampleRate/4)),m=r.createScriptProcessor(1024,1,1);m.onaudioprocess=W=>c.pull(W.outputBuffer.getChannelData(0));let g=r.createMediaStreamDestination();m.connect(g);let b=new Set,me={queue:c,endedListeners:b,release:()=>{m.onaudioprocess=null,m.disconnect(),c.clear();for(let W of g.stream.getTracks())W.stop();r.close().catch(()=>{})}};F=me;try{let W=await D({...C,type:"microphone-open",id:E(p),payload:{sampleRate:r.sampleRate}},12e4);if(!W||!("opened"in W)||W.opened!==!0)throw new u("HOST_REJECTED","Host did not open the microphone.");if(await l,F!==me)throw new u("DISCONNECTED","The microphone closed while it was opening.")}catch(W){throw F===me&&(F=null),me.release(),Qe(),W}return{stream:g.stream,close:()=>{F===me&&(F=null,me.release(),Qe())},onEnded:W=>(b.add(W),()=>{b.delete(W)})}},oo=t=>{!Xo(t)||!vr(t)||(t.preventDefault(),to())},ro=t=>{!Xo(t)||t.key!=="Escape"||a?.surface!=="popover"||!a.popover||(t.preventDefault(),ao(a.popover.id,"escape").catch(()=>{}))},Ue=()=>{let t=a?.surface==="popover"?a.popover:void 0;if(!t)return;let r=Z||Ie;Yt!==r&&(Yt=r,co(t.id,r).catch(()=>{}))},ve=()=>{a?.surface!=="popover"||Z||(Z=!0,Ue())},no=t=>{a?.surface!=="popover"||t.relatedTarget!==null||!Z||(Z=!1,Ue())},so=()=>{a?.surface!=="popover"||Ie||(Ie=!0,Ue())},io=()=>{a?.surface!=="popover"||!Ie||(Ie=!1,Ue())},Y=(t,r=1024)=>{if(!t.trim()||t.length>r)throw new u("HOST_REJECTED",`Identity must contain 1 to ${r} characters.`)},Ze=async t=>{t.kind!=="projects"&&Y(t.projectId);let r=await D({...C,type:"workspace-read",id:E(p),payload:t});if(!r||!("kind"in r)||!("state"in r)||r.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return r},et=async(t,r)=>{t.kind!=="projects"&&Y(t.projectId);let l=E(p);ae.set(l,r);try{await M({...C,type:"workspace-subscribe",id:E(p),payload:{subscriptionId:l,query:t}})}catch(c){throw ae.delete(l),I||X({...C,type:"workspace-unsubscribe",id:E(p),payload:{subscriptionId:l}}),c}return()=>{!ae.delete(l)||I||X({...C,type:"workspace-unsubscribe",id:E(p),payload:{subscriptionId:l}})}},mr=async(t,r)=>{t.kind==="session"&&Y(t.sessionId),t.kind==="project"&&Y(t.projectId);let l=E(p);A.set(l,r);try{await M({...C,type:"shells-subscribe",id:E(p),payload:{subscriptionId:l,scope:t}})}catch(c){throw A.delete(l),I||X({...C,type:"shells-unsubscribe",id:E(p),payload:{subscriptionId:l}}),c}return()=>{!A.delete(l)||I||X({...C,type:"shells-unsubscribe",id:E(p),payload:{subscriptionId:l}})}},Me=async t=>{if("key"in t&&(t.key.length===0||t.key.length>128))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!ge(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>65536)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&a?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let r=await D({...C,type:"storage",id:E(p),payload:t});if(!r||!("storage"in r)||r.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return r},ao=(t,r)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):M({...C,type:"popover-close",id:E(p),payload:r?{id:t,reason:r}:{id:t}}),co=(t,r)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):M({...C,type:"popover-anchor",id:E(p),payload:{id:t,active:r}});return o.addEventListener("keydown",ro,!0),o.addEventListener("pointerover",ve),o.addEventListener("pointermove",ve),o.addEventListener("pointerout",no),o.addEventListener("focus",so),o.addEventListener("blur",io),{onAction:t=>(te=t,()=>{te===t&&(te=null)}),listProjects:async()=>{let t=await Ze({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async t=>{let r=await Ze({kind:"worktrees",projectId:t});if(r.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return r},listSessions:async t=>{let r=await Ze({kind:"sessions",projectId:t});if(r.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return r},onProjects:t=>et({kind:"projects"},r=>{r.kind==="projects"&&t(r)}),onWorktrees:(t,r)=>et({kind:"worktrees",projectId:t},l=>{l.kind==="worktrees"&&r(l)}),onSessions:(t,r)=>et({kind:"sessions",projectId:t},l=>{l.kind==="sessions"&&r(l)}),onRunningShells:(t,r)=>mr(t,r),readShellOutput:async(t,r)=>{Y(t,128);let l=r?.cursor;if(l!==void 0&&(!Number.isInteger(l)||l<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let c=r?.tailBytes;if(c!==void 0&&(!Number.isInteger(c)||c<1||c>65536))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${65536}.`);let g=await D({...C,type:"shell-output",id:E(p),payload:{shellId:t,cursor:l,tailBytes:c}});if(!g||typeof g.output!="string"||!Number.isFinite(g.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return g},stopShell:async t=>{if(Y(t,128),(await D({...C,type:"shell-stop",id:E(p),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async t=>{Y(t),await M({...C,type:"open-session",id:E(p),payload:{sessionId:t}})},storage:{get:async(t,r)=>{let l=Fe(r),c={op:"get",key:t};l&&(c.scope=l);let m=await Me(c);return m.op==="get"&&m.found?m.value:void 0},set:async(t,r,l)=>{let c=Fe(l),m={op:"set",key:t,value:r};c&&(m.scope=c),await Me(m)},delete:async(t,r)=>{let l=Fe(r),c={op:"delete",key:t};l&&(c.scope=l),await Me(c)},keys:async t=>{let r=Fe(t),l={op:"keys"};r&&(l.scope=r);let c=await Me(l);if(c.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return c.keys}},onReady:t=>(d.add(t),a&&t(a),()=>{d.delete(t)}),onDirectory:t=>(_.add(t),a&&t(a.directory),()=>{_.delete(t)}),onSession:t=>(f.add(t),a&&t(a.session),()=>{f.delete(t)}),onSessionLifecycle:t=>(h.add(t),y&&t(y),()=>{h.delete(t)}),onConnection:t=>(N.add(t),a&&t(a.connection),()=>{N.delete(t)}),onSettings:t=>(Q.add(t),a&&t(a.settings),()=>{Q.delete(t)}),onItem:t=>(de.add(t),a&&t(a.item),()=>{de.delete(t)}),onBlock:t=>(pe.add(t),a?.block&&t(a.block),()=>{pe.delete(t)}),onServiceEvent:t=>(ne.add(t),()=>{ne.delete(t)}),onStatusControl:t=>(ue.add(t),()=>{ue.delete(t)}),onPopoverClosed:t=>(_e.add(t),()=>{_e.delete(t)}),setStatusControls:t=>a?.features?.statusControls!==!0?Promise.reject(new u("UNSUPPORTED","This host does not support status controls.")):To(t)?M({...C,type:"status-controls",id:E(p),payload:{controls:t}}):Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options.")),openPopover:t=>a?.features?.popovers!==!0?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):it(t)?M({...C,type:"popover-open",id:E(p),payload:t}):Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data.")),closePopover:ao,setPopoverAnchorActive:co,onResolve:t=>(z=t,()=>{z===t&&(z=null)}),toast:t=>{let r=t.message.trim();return!r||r.length>we?Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${we} characters.`)):t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Le)?Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Le} characters.`)):M({channel:T,v:1,type:"toast",id:E(p),payload:{...t,message:r}})},openUrl:t=>M({channel:T,v:1,type:"open-url",id:E(p),payload:{url:t}}),openCommit:t=>pt(t)?M({channel:T,v:1,type:"open-commit",id:E(p),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:t=>M({channel:T,v:1,type:"block-answer",id:E(p),payload:{text:t.trim().slice(0,ct)}}),openSurface:t=>M({channel:T,v:1,type:"open-surface",id:E(p),payload:{surfaceId:t}}),writeClipboard:t=>M({channel:T,v:1,type:"clipboard-write",id:E(p),payload:{text:t}}),compose:t=>M({channel:T,v:1,type:"compose",id:E(p),payload:t}),attach:t=>M({channel:T,v:1,type:"attach",id:E(p),payload:xe(t)}),startSession:async t=>{t.projectId!==void 0&&Y(t.projectId);let r=t.worktree;r&&r!==!0&&(r.kind==="existing"?Y(r.directory):(r.name!==void 0&&Y(r.name,200),r.baseBranch!==void 0&&Y(r.baseBranch,200)));let l=await D({channel:T,v:1,type:"start-session",id:E(p),payload:Tt(t)},e.requestTimeoutMs??18e4);if(!lt(l))throw new u("HOST_REJECTED","Host did not return a session.");return l},prompt:t=>D({channel:T,v:1,type:"prompt",id:E(p),payload:St(t)}).then(r=>{if(!dt(r))throw new u("HOST_REJECTED","Host did not return a prompt result.");return r}),sessionLink:t=>M({channel:T,v:1,type:"session-link",id:E(p),payload:xe(t)}),close:()=>M({channel:T,v:1,type:"close",id:E(p)}),oauthStart:()=>M({channel:T,v:1,type:"oauth-start",id:E(p)}),oauthDisconnect:()=>M({channel:T,v:1,type:"oauth-disconnect",id:E(p)}),request:t=>(He(t.path)?D({channel:T,v:1,type:"request",id:E(p),payload:t}):Vo()).then(r=>{if(!Xe(r))throw new u("HOST_REJECTED","Host request result was empty.");return r}),serviceRequest:t=>(He(t.path)?D({channel:T,v:1,type:"service-request",id:E(p),payload:t}):Vo()).then(r=>{if(!Xe(r))throw new u("HOST_REJECTED","Host service request result was empty.");return r}),serviceStatus:()=>D({channel:T,v:1,type:"service-status",id:E(p)}).then(t=>{if(!ht(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:t=>(Oe(t)?D({channel:T,v:1,type:"file-read",id:E(p),payload:{path:t}}):Ve()).then(r=>{if(!mt(r))throw new u("HOST_REJECTED","Host did not return file content.");return r}),writeFile:(t,r)=>Oe(t)?r.length>Ge?Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${Ge} characters.`)):D({channel:T,v:1,type:"file-write",id:E(p),payload:{path:t,content:r}}).then(l=>{if(!gt(l))throw new u("HOST_REJECTED","Host did not confirm the write.");return l}):Ve(),listDir:t=>(Oe(t)?D({channel:T,v:1,type:"file-list",id:E(p),payload:{path:t}}):Ve()).then(r=>{if(!xt(r))throw new u("HOST_REJECTED","Host did not return directory entries.");return r}),stat:t=>(Oe(t)?D({channel:T,v:1,type:"file-stat",id:E(p),payload:{path:t}}):Ve()).then(r=>{if(!Ot(r))throw new u("HOST_REJECTED","Host did not return file status.");return r}),generate:t=>{let r=t.prompt.trim(),l=t.system?.trim();if(r.length===0||r.length>De)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${De} characters.`));if(l!==void 0&&(l.length===0||l.length>$e))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${$e} characters.`));let c=t.maxOutputTokens===void 0?void 0:Math.min(_t,Math.max(1,Math.floor(t.maxOutputTokens)));if(c!==void 0&&!Number.isFinite(c))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let m={prompt:r};return l!==void 0&&(m.system=l),c!==void 0&&(m.maxOutputTokens=c),D({channel:T,v:1,type:"generate",id:E(p),payload:m},e.requestTimeoutMs??Et).then(g=>{if(!Rt(g))throw new u("HOST_REJECTED","Host did not return generated text.");return g})},onLateGenerateResult:t=>{K.add(t);for(let r of ee.splice(0))R([t],r);return Zt(),()=>{K.delete(t)}},openMicrophone:hr,setBadge:t=>M({channel:T,v:1,type:"badge",id:E(p),payload:{count:ft(t)}}),setHeight:t=>M({channel:T,v:1,type:"resize",id:E(p),payload:{height:At(t)}}),onFileOpen:t=>(se.add(t),ie||(ie=!0,o.addEventListener("keydown",oo,!0)),H&&t(H),()=>{se.delete(t)}),onFileSnapshot:t=>(q=t,()=>{q===t&&(q=null)}),onFileSaved:t=>(O.add(t),()=>{O.delete(t)}),reportFileChange:t=>Ye({...C,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:to,reportFileUnsupported:()=>Ye({...C,type:"file-unsupported"}),dispose:()=>{for(let t of ae.keys())X({...C,type:"workspace-unsubscribe",id:E(p),payload:{subscriptionId:t}});ae.clear();for(let t of A.keys())X({...C,type:"shells-unsubscribe",id:E(p),payload:{subscriptionId:t}});A.clear(),F&&(Qe(),F.release(),F=null),I=!0,z=null,te=null,q=null,se.clear(),O.clear(),ie&&o.removeEventListener("keydown",oo,!0),o.removeEventListener("message",eo),o.removeEventListener("keydown",ro,!0),o.removeEventListener("pointerover",ve),o.removeEventListener("pointermove",ve),o.removeEventListener("pointerout",no),o.removeEventListener("focus",so),o.removeEventListener("blur",io);for(let t of J.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));J.clear(),d.clear(),_.clear(),f.clear(),h.clear(),N.clear(),Q.clear(),de.clear(),pe.clear(),ne.clear(),ue.clear(),_e.clear(),K.clear(),ee.length=0}}};var zo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Nn=new Set(zo);var Mr=10*6e4;var Nr=10*6e4;var wr=10*6e4;var Lr=10*6e4;var qo=["none","agent","user"];var Ln=new Set(qo);var Pr=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Gr=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Jo=(e,o)=>{o.style.colorScheme=e.mode;for(let[n,i]of Pr)o.style.setProperty(n,e.tokens[i]);for(let[n,i,d]of Gr){let _=e.tokens[d]??"";o.style.setProperty(n,_),o.style.setProperty(i,_)}o.style.setProperty("font-family",e.tokens.font),o.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),o.style.setProperty("line-height","1.45"),o.style.setProperty("color",e.tokens.foreground)},vt=(e,o)=>{Jo(e.theme,o),o.dataset&&(o.dataset.ocSurface=e.surface,o.dataset.ocTheme=e.theme.mode)};var Dr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},k=(e,o)=>`var(--${e}, var(--oc-${Dr[e]}, ${o}))`,re=k("surface-background","transparent"),Ke=k("surface-elevated","transparent"),Re=k("surface-elevated-foreground","inherit"),B=k("surface-foreground","inherit"),U=k("surface-muted-foreground","gray"),$r=k("surface-muted","transparent"),Ee=k("interactive-border","currentColor"),V=k("interactive-hover","transparent"),Te=k("interactive-active","transparent"),Mt=k("interactive-selection","transparent"),Nt=k("interactive-selection-foreground","inherit"),oe=k("primary","currentColor"),wt=k("primary-text","inherit"),Lt=k("error-text","inherit"),Hr=k("font-sans","inherit"),Pt=k("font-mono","monospace"),er=k("radius","9px"),Gt=`calc(${er} - 2px)`,Yo=`calc(${er} - 4px)`,v=(e,o,n="transparent")=>`color-mix(in srgb, ${e} ${o}%, ${n})`,Qo=`background-image: linear-gradient(${V}, ${V});`,Dt=(e,o="0.5px")=>`box-shadow: inset 0 0 0 ${o} ${e}, var(--oc-sdk-field-lift);`,$t="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Zo="box-shadow: var(--oc-sdk-lit);",Ht=`inset 0 0.5px 0 0 ${v(B,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,Xr=`
:root {
  --oc-sdk-edge: ${v(B,16)};
  --oc-sdk-field-bg: ${Ke};
  --oc-sdk-raised-bg: ${re};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${v(B,14)};
  --oc-sdk-field-bg: ${v(re,50,Ke)};
  --oc-sdk-raised-bg: ${Ke};
  --oc-sdk-field-lift: ${Ht};
  --oc-sdk-raised-lift: ${Ht};
  --oc-sdk-lit: ${Ht};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Be=e=>{let o=k(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${o}; --oc-sdk-tone-text: ${k(`${e}-text`,"inherit")}; }`},s=e=>`calc(${e}rem / 14)`,Vr=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: ${s(8)}; height: ${s(32)}; padding: 0 ${s(12)}; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: ${s(6)}; height: ${s(28)}; padding: 0 ${s(10)}; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: ${s(4)}; height: ${s(24)}; padding: 0 ${s(8)}; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: ${s(14)}; height: ${s(14)}; }

.oc-sdk-field { display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: ${s(32)}; padding: 0 ${s(10)}; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: ${s(8)} ${s(10)}; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: ${s(34)}; padding-right: ${s(34)}; }
.oc-sdk-search-icon { position: absolute; left: ${s(11)}; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: ${s(6)}; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: ${s(24)}; height: ${s(24)}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: ${s(6)}; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: ${s(28)}; padding: 0 ${s(10)}; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: ${s(2)}; min-width: ${s(160)}; max-width: calc(100vw - ${s(16)}); max-height: min(${s(320)}, calc(100vh - ${s(16)})); overflow: auto; padding: ${s(4)}; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: ${s(2)} ${s(2)} ${s(4)}; }
.oc-sdk-popup-search .oc-sdk-input { height: ${s(28)}; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: ${s(8)}; width: 100%; padding: ${s(6)} ${s(8)}; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: ${s(14)}; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: ${s(8)}; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: ${s(8)}; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: ${s(14)}; height: ${s(14)}; margin-top: ${s(3)}; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: ${s(36)}; height: ${s(20)}; --oc-sdk-thumb-travel: ${s(16)}; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: ${s(2)}; left: ${s(2)}; width: ${s(16)}; height: ${s(16)}; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: ${s(2)}; padding: ${s(2)}; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: ${s(6)}; height: ${s(28)}; padding: 0 ${s(10)}; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: ${s(1)} ${s(6)}; font-size: ${s(11)}; font-weight: 500; line-height: ${s(16)}; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: ${s(8)}; width: 100%; padding: ${s(6)} ${s(8)}; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: ${s(64)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: ${s(16)} ${s(8)}; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${s(4)}; padding: ${s(40)} ${s(16)}; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: ${s(12)}; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: ${s(8)}; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: ${s(16)}; height: ${s(16)}; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: ${s(12)}; height: ${s(12)}; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: ${s(12)}; padding: ${s(8)} ${s(12)}; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: ${s(2)}; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: ${s(8)}; width: 100%; margin: ${s(8)} 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: ${s(4)} 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: ${s(6)}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: ${s(2)}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: ${s(8)} 0; }

/* Under a finger the controls reach the app's touch sizes: rows and options 44px like its sheets, every other
   control at least 36px. Inputs keep 16px text, below which iOS zooms the page on focus. */
@media (pointer: coarse) {
  .oc-sdk-btn, .oc-sdk-input { height: ${s(40)}; }
  .oc-sdk-btn[data-size="sm"], .oc-sdk-btn[data-size="xs"], .oc-sdk-trigger, .oc-sdk-tab, .oc-sdk-popup-search .oc-sdk-input { height: ${s(36)}; }
  .oc-sdk-input, .oc-sdk-popup-search .oc-sdk-input { font-size: max(16px, 0.875rem); }
  .oc-sdk-search-clear { width: ${s(36)}; height: ${s(36)}; right: 0; }
  .oc-sdk-row, .oc-sdk-option { min-height: ${s(44)}; }
  .oc-sdk-check { min-height: ${s(36)}; padding: ${s(8)} 0; }
}
`,tr=`${Xr}
.oc-sdk { color: ${B}; font-family: ${Hr}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Qo} }
.oc-sdk-mono { font-family: ${Pt}; }
.oc-sdk-muted { color: ${U}; }
${Be("success")}${Be("warning")}${Be("error")}${Be("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${oe}; --oc-sdk-tone-text: ${wt}; }

.oc-sdk-btn { border-radius: ${Gt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Yo}; }
.oc-sdk-btn[data-variant="default"] { color: ${wt}; background: ${v(oe,10,re)}; border-color: ${v(oe,12)}; ${Zo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${v(oe,16,re)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${v(oe,22,re)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${$r}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${V}, ${V}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${Te}, ${Te}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${Re}; ${$t} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${V}, ${V}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${Te}, ${Te}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${V}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${Te}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${k("status-error","red")}; color: ${Lt}; background: ${v("var(--oc-sdk-tone)",7,re)}; border-color: ${v("var(--oc-sdk-tone)",12)}; ${Zo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${v("var(--oc-sdk-tone)",9,re)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${v("var(--oc-sdk-tone)",11,re)}; box-shadow: none; }

.oc-sdk-field-note { color: ${U}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Lt}; }
.oc-sdk-input { border-radius: ${Gt}; background: var(--oc-sdk-field-bg); color: ${Re}; ${Dt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${U}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${V}, ${V}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Dt(v(B,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Dt(k("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Pt}; }

.oc-sdk-search-icon { color: ${U}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${oe}; }
.oc-sdk-search-clear { border-radius: ${Yo}; color: ${U}; }
.oc-sdk-search-clear:hover { background: ${V}; color: ${B}; }

.oc-sdk-trigger { border-radius: ${Gt}; background: var(--oc-sdk-raised-bg); color: ${Re}; ${$t} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${V}, ${V}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${Te}, ${Te}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${U}; }
.oc-sdk-trigger-chevron { color: ${U}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${Re}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Ke}; background-clip: padding-box; color: ${Re}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${V}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Mt}; color: ${Nt}; }
.oc-sdk-option-check { color: ${B}; }
.oc-sdk-option[data-destructive="true"] { color: ${Lt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${v(k("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${U}; }
.oc-sdk-popup-empty { color: ${U}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${Ee}; border-radius: 4px; color: ${B}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${v(B,60,Ee)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${Ee}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${re}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${oe}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Qo} }
.oc-sdk-check-desc { color: ${U}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${v(B,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${U}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${B}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Nt}; background: ${Mt}; border-color: ${Ee}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${Re}; background: var(--oc-sdk-raised-bg); ${$t} }
.oc-sdk-tab-count { color: ${U}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${v(B,6)}; color: ${U}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${v("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${V}; }
.oc-sdk-row[aria-selected="true"] { background: ${Mt}; color: ${Nt}; }
.oc-sdk-row-lead { font-family: ${Pt}; color: ${U}; }
.oc-sdk-row-sub { color: ${U}; }
.oc-sdk-row-meta { color: ${U}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${U}; }

.oc-sdk-empty-body { color: ${U}; }

.oc-sdk-spinner { color: ${U}; }
.oc-sdk-spinner-ring { border-color: ${Ee}; border-top-color: ${oe}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${v("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${U}; }

.oc-sdk-separator { color: ${U}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${v(Ee,40)}; }

.oc-sdk-progress-label { color: ${U}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${v(B,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${oe}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${k("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${k("success-text","inherit")}; }

.oc-sdk-text a { color: ${wt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${v(Ee,60)}; }
`,L=`
${tt}
${Vr}
${tr}`;var or="oc-sdk-ui-style";var P=e=>{let o=document.getElementById(or);if(o instanceof HTMLStyleElement){o.textContent!==e&&(o.textContent=e);return}ot(document);let n=document.createElement("style");n.id=or,n.textContent=e,document.head.appendChild(n)},G=(e,o)=>{let n=document.createElement(e);return o&&(n.className=o),n},ce=e=>{let o=G("button",e);return o.type="button",o},j=(e,o)=>{let n=o??"";e.textContent!==n&&(e.textContent=n)},Se=(e,o,n)=>{n==null||n===""?e.removeAttribute(o):e.getAttribute(o)!==n&&e.setAttribute(o,n)};var Fr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},be=(e,o)=>{P(L);let n=o,i=ce("oc-sdk oc-sdk-btn"),d=Fr(),_=document.createElement("span");i.append(_),e.append(i);let f=()=>{i.dataset.variant=n.variant??"default",i.dataset.size=n.size??"default",i.disabled=!!n.disabled||!!n.loading,i.dataset.loading=n.loading?"true":"false",i.setAttribute("aria-busy",n.loading?"true":"false"),n.loading&&d.parentNode!==i?i.prepend(d):!n.loading&&d.parentNode===i&&d.remove(),j(_,n.label)},h=()=>{n.disabled||n.loading||n.onClick()};return i.addEventListener("click",h),f(),{update:N=>{n={...n,...N},f()},dispose:()=>{i.removeEventListener("click",h),i.remove()}}};var Xt=(e,o)=>{Se(e,"data-tone",o&&o!=="neutral"?o:null)},Vt=(e,o)=>{P(L);let n=o,i=G("span","oc-sdk oc-sdk-badge");e.append(i);let d=()=>{j(i,n.label),Xt(i,n.tone)};return d(),{update:_=>{n={...n,..._},d()},dispose:()=>{i.remove()}}};var ke=class extends Error{status;constructor(o,n){super(n),this.status=o}},jr=e=>{if(e)try{return JSON.parse(e)}catch{return e}},rr=e=>async(o,n,i)=>{let d={method:o,path:n,query:{},body:i===void 0?void 0:JSON.stringify(i)},_;try{_=await e.serviceRequest(d)}catch(h){throw new ke(0,`Tasks service did not answer (${h instanceof Error?h.message:String(h)}).`)}let f=jr(_.body);if(_.status>=400){let h=f&&typeof f=="object"?f:{},N=typeof h.error=="string"&&h.error?h.error:typeof f=="string"&&f?f.slice(0,300):`Tasks service answered ${_.status}.`;throw new ke(_.status,N)}return f};var zr={backlog:"var(--oc-muted)",todo:"var(--oc-primary)",open:"var(--oc-primary)",in_progress:"var(--oc-info)",doing:"var(--oc-info)",review:"var(--oc-warning)",done:"var(--oc-success)",closed:"var(--oc-success)"},nr=["var(--oc-info)","var(--oc-primary)","var(--oc-warning)","var(--oc-success)"],qr=e=>{let o=0;for(let n=0;n<e.length;n+=1)o=o*31+e.charCodeAt(n)>>>0;return o},sr=e=>{let o=e.trim().toLowerCase().replace(/[\s-]+/g,"_");return zr[o]??nr[qr(o)%nr.length]};var ir=e=>{let o=e.replace(/[_-]+/g," ").trim();return o?o.charAt(0).toUpperCase()+o.slice(1):e},ar=e=>/^\d+$/.test(e.externalId)?`#${e.externalId}`:/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(e.externalId)?e.externalId:e.adapterId==="local"?"":`#${e.externalId.slice(0,8)}`;var cr=e=>{if(!e)return"";let o=e.replace(/^[^:]+:/,"");return o.split("/").slice(-1)[0]??o},Ft=(e,o=Date.now())=>{if(!e||!Number.isFinite(e))return"";let n=Math.max(0,Math.round((o-e)/1e3));if(n<45)return"just now";let i=Math.round(n/60);if(i<60)return`${i}m ago`;let d=Math.round(i/60);if(d<24)return`${d}h ago`;let _=Math.round(d/24);if(_<30)return`${_}d ago`;let f=Math.round(_/30);return f<12?`${f}mo ago`:`${Math.round(f/12)}y ago`},Bt=e=>({github:"GitHub",gitlab:"GitLab",local:"Local",trello:"Trello",linear:"Linear",jira:"Jira"})[e]??e;var lr=e=>{let o={};for(let n of e)n.syncState==="error"&&n.syncError&&!(n.adapterId in o)&&(o[n.adapterId]=n.syncError);return{open:e.filter(n=>n.status!=="done").length,total:e.length,errorsByAdapter:o}};var $="var(--oc-border,color-mix(in srgb,currentColor 18%,transparent))",w="var(--oc-muted,color-mix(in srgb,currentColor 60%,transparent))",fe="var(--oc-hover,color-mix(in srgb,currentColor 8%,transparent))",Kt="var(--oc-muted-surface,color-mix(in srgb,currentColor 5%,transparent))",Je="var(--oc-elevated,var(--oc-bg,canvas))",le="var(--oc-radius,9px)",dr="var(--oc-mono,ui-monospace,monospace)",Jr=`
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--oc-bg);color:var(--oc-fg);font-family:var(--oc-font);font-size:13px;line-height:1.45}
#root{height:100%}
[hidden]{display:none!important}
.tk{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0}
.tk-slot{display:contents}
.tk-muted{color:${w};font-size:12px}
.tk-mono{font:12px ${dr};color:${w}}
.tk-grow{flex:1 1 auto;min-width:0}
.tk-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tk-fbar{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-bottom:1px solid ${$};flex:0 0 auto}
.tk-fbar-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.tk-fbar-row>.tk-search{flex:1 1 160px;min-width:120px}
.tk-fbar-row>.tk-pill{flex:0 1 auto;min-width:0}
.tk[data-size="s"] .tk-fbar-row>.tk-pill{flex:1 1 120px}
.tk-status{font-size:11px;color:${w};display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.tk-dot{width:7px;height:7px;border-radius:99px;background:var(--oc-success);flex:0 0 auto}
.tk-dot[data-tone="busy"]{background:var(--oc-warning);animation:tk-pulse 1s ease-in-out infinite}
.tk-dot[data-tone="error"]{background:var(--oc-error)}
@keyframes tk-pulse{50%{opacity:.35}}
.tk-note{margin:8px 12px 0;padding:7px 10px;border:1px solid ${$};border-radius:${le};font-size:12px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex:0 0 auto}
.tk-note[data-tone="error"]{border-color:var(--oc-error)}
.tk-note[data-tone="warning"]{border-color:var(--oc-warning)}
.tk-note-x{all:unset;cursor:pointer;color:${w};padding:0 4px;line-height:1;font-size:15px}
.tk-note-x:hover{color:var(--oc-fg)}
.tk-view{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px 14px}
.tk-view[data-view="kanban"]{display:flex;padding-bottom:10px;overflow:hidden}
.tk-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 16px;text-align:center;color:${w}}
.tk-empty b{color:var(--oc-fg);font-weight:600}

.tk-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:16px;border:1px solid ${$};border-radius:99px;padding:0 7px;color:${w};white-space:nowrap;max-width:100%}
.tk-badge[data-tone="warning"]{border-color:var(--oc-warning);color:var(--oc-warning-text,var(--oc-fg))}
.tk-badge[data-tone="error"]{border-color:var(--oc-error);color:var(--oc-error-text,var(--oc-fg))}
.tk-badge[data-tone="info"]{border-color:var(--oc-info);color:var(--oc-info-text,var(--oc-fg))}
.tk-label{display:inline-flex;align-items:center;font-size:11px;line-height:16px;border-radius:99px;padding:0 7px;color:var(--oc-fg);background:color-mix(in srgb,var(--c,var(--oc-primary)) 18%,transparent);border:1px solid color-mix(in srgb,var(--c,var(--oc-primary)) 45%,transparent);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.tk-avatar{width:20px;height:20px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;background:${Kt};border:1px solid ${$};color:${w};flex:0 0 auto}
.tk-src{font-size:11px;color:${w};display:inline-flex;align-items:center;gap:5px}
.tk-src::before{content:"";width:6px;height:6px;border-radius:2px;background:var(--c,${w})}

.tk-chev{display:inline-block;width:7px;height:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(45deg);margin:0 2px 2px}
.tk-chev[data-dir="right"]{transform:rotate(-45deg);margin:0 2px 0 0}
.tk-iconbtn{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;color:${w};flex:0 0 auto}
.tk-iconbtn:hover{background:${fe};color:var(--oc-fg)}
.tk-iconbtn:focus-visible{outline:2px solid var(--oc-focus,currentColor)}

.tk-list{display:flex;flex-direction:column;gap:6px}
.tk-item{display:flex;flex-direction:column;gap:5px;padding:9px 11px;border:1px solid ${$};border-radius:${le};background:${Je};cursor:pointer;min-width:0}
.tk-item:hover{background:${fe}}
.tk-item:focus-visible{outline:2px solid var(--oc-focus,currentColor)}
.tk-item[data-attn="1"]{border-left:3px solid var(--oc-warning)}
.tk-item-top{display:flex;align-items:center;gap:8px;min-width:0}
.tk-item-title{font-weight:550;font-size:13px;overflow-wrap:anywhere;flex:1 1 auto;min-width:0}
.tk-item-sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font-size:11px;color:${w}}
.tk-err{font-size:12px;color:var(--oc-error-text,var(--oc-error));overflow-wrap:anywhere}
.tk-pillbtn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--oc-fg);white-space:nowrap}
.tk-pillbtn:hover{background:color-mix(in srgb,var(--c) 24%,transparent)}

.tk-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
.tk-table th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:${w};text-align:left;padding:6px 8px;border-bottom:1px solid ${$};white-space:nowrap}
.tk-table td{padding:8px;border-bottom:1px solid ${$};vertical-align:middle;min-width:0;overflow:hidden}
.tk-table tbody tr{cursor:pointer}
.tk-table tbody tr:hover{background:${fe}}
.tk-table td.tk-cell-title{overflow:visible}
.tk-cell-clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}

.tk-columns{display:flex;gap:10px;align-items:stretch;overflow-x:auto;overflow-y:hidden;flex:1 1 auto;min-height:0;padding-bottom:4px}
.tk-column{flex:0 0 272px;width:272px;display:flex;flex-direction:column;min-height:0;background:${Kt};border:1px solid ${$};border-top:3px solid var(--c);border-radius:${le}}
.tk[data-size="s"] .tk-column{flex-basis:84%;width:84%}
.tk-column.tk-dragover{outline:2px solid var(--oc-focus,currentColor);outline-offset:-2px}
.tk-column-head{display:flex;align-items:center;gap:6px;padding:8px 8px 8px 6px;cursor:grab}
.tk-column-count{margin-left:auto;font-size:11px;color:${w};display:inline-flex;align-items:center;gap:4px}
.tk-column-body{display:flex;flex-direction:column;gap:7px;padding:2px 8px 10px;overflow-y:auto;flex:1 1 auto;min-height:48px}
.tk-column-empty{font-size:12px;color:${w};text-align:center;padding:14px 4px;border:1px dashed ${$};border-radius:${le}}
.tk-column.tk-collapsed{flex:0 0 44px;width:44px;align-items:center;padding:8px 0;gap:10px;cursor:pointer}
.tk-column.tk-collapsed:hover{background:${fe}}
.tk-collapsed-title{writing-mode:vertical-rl;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:600;max-height:240px}
.tk-collapsed-count{font-size:11px;color:${w}}
.tk-card{display:flex;flex-direction:column;gap:7px;padding:9px 10px;border:1px solid ${$};border-radius:${le};background:${Je};cursor:pointer;min-width:0}
.tk-card:hover{background:${fe}}
.tk-card:focus-visible{outline:2px solid var(--oc-focus,currentColor)}
.tk-card.tk-dragging{opacity:.4}
.tk-card[data-attn="1"]{border-left:3px solid var(--oc-warning)}
.tk-card-foot{display:flex;align-items:center;gap:8px;min-width:0;font-size:11px;color:${w}}

.tk-overlay{position:fixed;inset:0;z-index:50;background:color-mix(in srgb,var(--oc-bg,#000) 55%,transparent);backdrop-filter:blur(1px);display:flex;align-items:flex-start;justify-content:center;padding:max(12px,4vh) 12px 12px;overflow:hidden}
.tk-dialog{display:flex;flex-direction:column;width:100%;max-width:620px;max-height:100%;min-height:0;background:${Je};color:var(--oc-elevated-fg,var(--oc-fg));border:1px solid ${$};border-radius:calc(${le} + 3px);box-shadow:0 18px 50px color-mix(in srgb,#000 35%,transparent)}
.tk-dialog-head{display:flex;align-items:flex-start;gap:10px;padding:12px 12px 10px 16px;border-bottom:1px solid ${$};flex:0 0 auto}
.tk-dialog-title{flex:1 1 auto;min-width:0;margin:0;font-size:15px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.tk-dialog-body{display:flex;flex-direction:column;gap:14px;padding:14px 16px;overflow-y:auto;min-height:0;flex:1 1 auto}
.tk-dialog-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:10px 16px;border-top:1px solid ${$};flex:0 0 auto}
.tk-field-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:${w};margin-bottom:4px}
.tk-meta{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12px;color:${w}}
.tk-meta a{color:var(--oc-primary-text,var(--oc-primary));text-decoration:none}
.tk-meta a:hover{text-decoration:underline}
.tk-radio{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid ${$};border-radius:${le};cursor:pointer;font:12px ${dr};overflow-wrap:anywhere}
.tk-radio:hover{background:${fe}}
.tk-radio:has(input:checked){border-color:var(--oc-primary);background:${Kt}}

.tk-rail{display:flex;flex-direction:column;gap:12px;padding:12px;height:100%;overflow:auto}
.tk-rail-head{display:flex;align-items:center;gap:8px}
.tk-rail-head h2{margin:0;font-size:14px;font-weight:600;flex:1}
.tk-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:6px}
.tk-stat{border:1px solid ${$};border-radius:${le};background:${Je};padding:7px 9px;display:flex;flex-direction:column;gap:1px}
.tk-stat b{font-size:17px;font-weight:600}
.tk-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:${w}}
.tk-card-top{display:flex;align-items:flex-start;gap:4px;min-width:0}
.tk-card-top .tk-item-title{flex:1 1 auto;min-width:0}
.tk-card-menu{display:inline-flex;flex:0 0 auto;margin:-3px -4px 0 0}
.tk-chip{display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:0 6px;border-radius:99px;border:1px solid ${$};color:${w};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-chip[data-tone="error"]{color:var(--oc-error-text,var(--oc-error));border-color:color-mix(in srgb,var(--oc-error) 50%,transparent)}
.tk-chip[data-tone="success"]{color:var(--oc-success-text,var(--oc-success));border-color:color-mix(in srgb,var(--oc-success) 50%,transparent)}
.tk-toggle-on{background:${fe}}
.tk-form{display:flex;flex-direction:column;gap:10px}
`,pr=()=>{if(document.getElementById("tk-style"))return;let e=document.createElement("style");e.id="tk-style",e.textContent=Jr,document.head.append(e)};var x=(e,o="",n="")=>{let i=document.createElement(e);return o&&(i.className=o),n&&(i.textContent=n),i},Wt=e=>{e.replaceChildren()},jt=(e="tk-slot")=>x("span",e);var Yr=["backlog","todo","in_progress","review","done"],Qr=["local","github","gitlab","trello","linear","jira"],Ae=e=>typeof e=="string",zt=e=>typeof e=="number"&&Number.isFinite(e),Ce=e=>e===null||Ae(e),Zr=e=>e===null||zt(e);function ur(e){if(typeof e!="object"||e===null)return null;let o=e;return!Ae(o.id)||o.id.length===0||!Qr.includes(o.adapterId)||!Ae(o.externalId)||o.externalId.length===0||!Ce(o.url)||!Ae(o.title)||!Ae(o.description)||!Yr.includes(o.status)||!Ae(o.listId)||o.listId.length===0||!zt(o.rank)||!Ce(o.projectRef)||!Ce(o.assignee)||!Array.isArray(o.labels)||!o.labels.every(n=>Ae(n))||!zt(o.updatedAt)||o.syncState!=="synced"&&o.syncState!=="saving"&&o.syncState!=="error"||!Ce(o.syncError)||!Ce(o.sessionId)||!Zr(o.needsAttentionSince)?null:e}var _r="list-cache",en=56e3,tn=e=>({...e,description:""}),Er=(e,o)=>{let n=e.tasks.map(tn),i=_=>({...e,tasks:_,savedAt:o}),d=i(n);for(;n.length>0&&JSON.stringify(d).length>en;)n=n.slice(0,Math.floor(n.length*.8)),d=i(n);return d},on=e=>{if(!e||typeof e!="object"||Array.isArray(e))return null;let o=e;if(!Array.isArray(o.tasks))return null;let n=o.tasks.map(ur).filter(_=>_!==null),i=Array.isArray(o.health)?o.health.filter(_=>!!_&&typeof _=="object"&&typeof _.id=="string"&&typeof _.ok=="boolean"):[],d=Array.isArray(o.adapters)?o.adapters.filter(_=>!!_&&typeof _=="object"&&typeof _.id=="string"):null;return{tasks:n,health:i,adapters:d,savedAt:typeof o.savedAt=="number"?o.savedAt:0}},Tr=async e=>on(await e.get(_r)),Sr=(e,o)=>e.set(_r,o);var he=Ut(),qt=document.querySelector("#root");if(!qt)throw new Error("Missing #root");var fr={get:async e=>await he.storage.get(e),set:(e,o)=>he.storage.set(e,o)},Ar=!1,Jt=null;he.onReady(e=>{if(vt(e,document.documentElement),Ar)return;Ar=!0,pr(),qt.replaceChildren();let o=x("div","tk-rail"),n=x("div","tk-rail-head"),i=x("h2","","Tasks Hub"),d=jt(),_=jt();n.append(i,d,_);let f=x("div","tk-muted"),h=x("div","tk-stats"),N=x("div");N.style.cssText="display:flex;flex-direction:column;gap:12px";let Q=x("p","tk-muted","Open the Tasks Hub from the Extension pages menu above the session list.");o.append(n,f,h,N,Q),qt.append(o);let de=Vt(d,{label:"0",tone:"neutral"}),pe=be(_,{label:"Refresh",variant:"ghost",size:"xs",onClick:()=>{se()}}),ne=(O,q)=>{let H=x("div","tk-stat");return H.append(x("b","",String(q)),x("span","tk-muted",O)),H},ue=(O,q)=>{let H=lr(O),ie=O.filter(A=>A.needsAttentionSince!==null);de.update({label:String(H.open),tone:ie.length>0?"warning":"neutral"}),he.setBadge(H.open||null).catch(()=>{}),Wt(h),h.append(ne("Open",H.open),ne("Total",H.total),ne("Attention",ie.length)),Wt(N);let J=new Map;for(let A of O)A.status!=="done"&&J.set(A.listId,(J.get(A.listId)??0)+1);if(J.size>0){let A=x("div");A.style.cssText="display:flex;flex-direction:column;gap:6px",A.append(x("div","tk-section-title","By list"));let I=x("div","tk-row");I.style.gap="6px";for(let[p,a]of[...J].sort((y,Z)=>Z[1]-y[1]).slice(0,8)){let y=x("span","tk-pillbtn",`${ir(p)} \xB7 ${a}`);y.style.setProperty("--c",sr(p)),y.style.cursor="default",I.append(y)}A.append(I),N.append(A)}if(ie.length>0){let A=x("div");A.style.cssText="display:flex;flex-direction:column;gap:6px",A.append(x("div","tk-section-title","Needs attention"));let I=x("div","tk-list");for(let p of ie.sort((a,y)=>(y.needsAttentionSince??0)-(a.needsAttentionSince??0)).slice(0,6)){let a=x("div","tk-item");a.dataset.attn="1",p.sessionId&&a.addEventListener("click",()=>{he.openSession(p.sessionId).catch(()=>{})}),a.append(x("div","tk-item-title",p.title));let y=x("div","tk-item-sub");y.append(x("span","",Bt(p.adapterId)));let Z=ar(p);Z&&y.append(x("span","tk-mono",Z)),p.projectRef&&y.append(x("span","",cr(p.projectRef))),a.append(y),I.append(a)}A.append(I),N.append(A)}let ae=[...q.filter(A=>!A.ok&&A.kind!=="credentials").map(A=>`${A.label}: ${A.message??"unavailable"}`),...Object.entries(H.errorsByAdapter).map(([A,I])=>`${A}: ${I}`)];for(let A of ae){let I=x("div","tk-err",`\u26A0 ${A}`);N.append(I)}O.length===0&&N.append(x("div","tk-empty","No tasks yet."))},_e=rr(he),K=0,ee=[],z=[],te=!1,se=async()=>{if(!te){te=!0,pe.update({loading:!0,disabled:!0});try{let[O,q]=await Promise.all([_e("GET","/tasks"),_e("GET","/adapters").catch(()=>null)]);ee=O.tasks,z=O.health,K=Date.now(),ue(ee,z),f.textContent="Updated just now",Sr(fr,Er({tasks:ee,health:z,adapters:q?.adapters??null},K)).catch(()=>{})}catch(O){f.textContent=`${O instanceof ke?O.message:"Tasks service unavailable."}${K?` Showing data from ${Ft(K)}.`:""}`}finally{te=!1,pe.update({loading:!1,disabled:!1})}}};(async()=>{let O=await Tr(fr).catch(()=>null);O&&O.tasks.length>0?(ee=O.tasks,z=O.health,K=O.savedAt,ue(ee,z),f.textContent=`Saved list from ${Ft(O.savedAt)} \u2014 updating\u2026`):f.textContent="Loading\u2026",await se()})(),Jt=setInterval(()=>{document.hidden||se()},6e4)});window.addEventListener("pagehide",()=>{Jt&&clearInterval(Jt),he.dispose()});})();
