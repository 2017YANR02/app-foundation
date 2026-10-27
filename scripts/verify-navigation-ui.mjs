import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const consumers = process.argv.slice(2);
assert.ok(consumers.length, 'Pass installed consumer directories');
for (const dir of consumers) {
 const require=createRequire(dir+'/package.json');
 const {createElement:h}=require('react');
 const {renderToStaticMarkup:render}=require('react-dom/server');
 const {NavigationShell,NavigationMenu,SidebarToggle,ContinuousInsetCorner}=await import(pathToFileURL(dir+'/node_modules/@app-foundation/navigation-ui/dist/index.js').href);
 const items=[{id:'a',href:'/allowed',label:'<Allowed>',icon:h('svg'),active:true}];
 const collapsed=render(h(NavigationMenu,{items,collapsed:true,label:'Navigation',renderLink:props=>h('a',{...props,'data-host':'yes'})}));
 assert.match(collapsed,/aria-current="page"/);assert.match(collapsed,/data-host="yes"/);assert.match(collapsed,/title="&lt;Allowed&gt;"/);assert.doesNotMatch(collapsed,/<Allowed>/);
 for(const state of [false,true]){const toggle=render(h(SidebarToggle,{collapsed:state,onToggle(){},showLabel:'Show',hideLabel:'Hide'})); assert.ok(toggle.includes(`aria-expanded="${!state}"`));assert.ok(toggle.includes(`title="${state?'Show':'Hide'}"`));}
 const shell=render(h(NavigationShell,{items,labels:{navigation:'Nav',show:'Show',hide:'Hide',openMobile:'Open',closeMobile:'Close'},showNavigation:false,header:()=>h('header',null,'Host')},h('p',null,'Private host content')));
 assert.doesNotMatch(shell,/<aside/);assert.match(shell,/Private host content/);
 const embedded=render(h(NavigationShell,{items,groups:[{id:'secondary',label:'Secondary',icon:h('svg'),items:[{...items[0],badge:7}],defaultOpen:true}],contentAs:'div',labels:{navigation:'Nav',show:'Show',hide:'Hide',openMobile:'Open',closeMobile:'Close'},header:()=>null},'Body'));
 assert.match(embedded,/<details[^>]*open/);assert.match(embedded,/af-nav-badge/);assert.doesNotMatch(embedded,/<main/);
 const headerLayout=render(h(NavigationShell,{items,iconOnly:true,collapseTarget:'panel',togglePlacement:'header',labels:{navigation:'Nav',show:'Show',hide:'Hide',openMobile:'Open',closeMobile:'Close'},header:(mobile,desktop)=>h('header',null,mobile,desktop)},'Body'));
 assert.equal((headerLayout.match(/class="af-nav-toggle"/g)||[]).length,1);
 assert.ok(headerLayout.indexOf('class="af-nav-toggle"')<headerLayout.indexOf('</header>'));
 assert.match(headerLayout,/data-panel-collapsed="true"/);
 const rail=render(h(NavigationShell,{items,iconOnly:true,mobileLayout:'rail',collapseTarget:'panel',panelVisible:true,togglePlacement:'header',labels:{navigation:'Nav',show:'Show',hide:'Hide',openMobile:'Open',closeMobile:'Close'},header:(mobile,desktop)=>h('header',null,mobile,desktop)},h('section',{className:'af-nav-panel'},'Settings')));
 assert.match(rail,/data-mobile-layout="rail"/);assert.match(rail,/data-panel-collapsed="false"/);
 assert.match(rail,/af-nav-toggle/);assert.doesNotMatch(rail,/af-nav-mobile-toggle/);
 assert.match(headerLayout,/data-mobile-layout="drawer"/);assert.match(headerLayout,/af-nav-mobile-toggle/);
 let navigated=false;let activate;
 render(h(NavigationMenu,{items,collapsed:false,label:'Nav',onNavigate:()=>{navigated=true},renderLink:props=>{activate=props.onClick;return h('button',{type:'button'},props.children)}}));
 activate();assert.equal(navigated,true);
 const path=render(h(ContinuousInsetCorner));assert.match(path,/fill-rule="evenodd"/);assert.doesNotMatch(path,/NaN|undefined/);
 const css=readFileSync(require.resolve('@app-foundation/navigation-ui/navigation.css'),'utf8'); assert.ok(css.includes('prefers-reduced-motion')); 
 const postcss=createRequire(require.resolve('next/package.json'))('postcss');
 postcss.parse(css);

 console.log(dir+': packaged ESM rendering, host adapter, labels, active state, hidden navigation, corner geometry and CSS parse passed');
}
