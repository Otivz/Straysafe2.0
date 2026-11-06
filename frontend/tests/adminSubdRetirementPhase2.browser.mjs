// Phase 2 B03-B07: isolated Chrome, mocked APIs/map props, synthetic data only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.RETIREMENT_PHASE2_TEST_URL || 'http://127.0.0.1:5173';
const chromeBin = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'straysafe-retirement-phase2-'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });

const recent = new Date(Date.now()-86400000).toISOString();
const baseReport = {report_id:10, user_id:7, subdivision_id:1, category_id:4, status_id:2,current_status_id:2,animal_type:'Dog',
    animal_name:'Synthetic dog', created_at:recent,updated_at:recent, latitude:14.8018,longitude:121.0028,
    initial_latitude:14.8018,initial_longitude:121.0028, landmark:'Synthetic Gate', priority_level:'Low',
    is_verified:true, assigned_leader_id:99, visibility:'Public',description:'Synthetic case',media:[],comments:[],history:[],disputes:[],merged_reports:[]};
const reports = [ {...baseReport,status_id:1,current_status_id:1,is_verified:false}, {...baseReport,report_id:20,status_id:4,current_status_id:4},
    {...baseReport,report_id:30,status_id:5,current_status_id:5}, {...baseReport,report_id:40,status_id:13,current_status_id:13} ];
let report = {...baseReport};
let activeRole=2;
const referral = {referral_id:1,report_id:20,barangay_name:'Synthetic Barangay',referred_at:recent,referred_by_name:'Leader Demo',contact_method:'call',reason:'Demo referral',report_status_id:4,final_outcome:null,updates:[]};
const mission = {rescue_id:8,report_id:30,status_id:5,title:'Earlier demo endorsement',created_at:recent,escalated_date:recent,
    assigned_staff_name:'Recorded Demo Responder',assignments:[{assigned_at:recent}],report:reports[2]};
const landmarks = [{landmark_id:5,name:'Earlier Demo Shelter',category:'facility',is_holding_facility:true,facility_type:'Barangay Main Shelter',capacity:10,
    subdivision_id:1,barangay_id:1,latitude:14.802,longitude:121.003,contact_person:'Recorded Demo Caretaker',contact_number:'',description:'Earlier saved place'}];
const accountProfile = {user_id:42,role_id:4,name:'Synthetic Reviewer',email:'reviewer@example.com',subdivision_id:1,barangay_id:1,status:'Active',is_verified:true,city:'Demo City'};
const warnings = [{warning_id:1,pet_id:3,warning_level:'First Warning',violation_type:'Demo Warning One',description:'Demo reason',created_at:recent,issuer_name:null,issuer_role:null,status:'Issued'},
    {warning_id:2,pet_id:3,warning_level:'Second Warning',violation_type:'Demo Warning Two',description:'Earlier warning',created_at:recent,issuer_name:'Actual Recorded Barangay Staff',issuer_role:'Barangay Staff',status:'Issued'}];
const MAP_MODULE = `import React from '/node_modules/.vite/deps/react.js';
const h=React.createElement;
export const createPickupLocationIcon=()=>null;
export default function Map(p) {return h('div',{'data-phase2-map':JSON.stringify({center:p.center,markers:p.markers||[],routing:p.routing||null,hasHallDirections:!!p.onDirectionsFromBrgyClick}),style:{height:200}},
    p.onDirectionsClick ? h('button',{type:'button',onClick:p.onDirectionsClick},'Directions from me') : null,
    p.onDirectionsFromBrgyClick ? h('button',{type:'button',onClick:p.onDirectionsFromBrgyClick},'From hall') : null);}`;
let socket;
let command;
try {
    let port;
    for (let i = 0; i < 100; i++) {
        try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
    }
    assert(port, 'Chrome debugging port is available');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
    let nextId = 0;
    const pending = new Map();
    command = (method, params = {}) => new Promise((res, rej) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, 20000);
        pending.set(id, { resolve: res, reject: rej, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });

    let pageLoads = 0;
    const browserErrors = [];
    const calls = [];
    const writes = [];
    const json = (body,status=200) => ({body,status});
    const answer = (url,method,postData) => {
        const path=url.pathname.replace(/^\/api/,'').replace(/\/$/,'');
        calls.push({method,path});
        if(!['GET','OPTIONS'].includes(method)) writes.push({method,path,body:postData?JSON.parse(postData):null});
        if(path==='/auth/verify-session') return json({status:'valid',role_id:activeRole,is_verified:true});
        if(path==='/reports') return json(reports);
        if(path.match(/^\/reports\/\d+$/)) return json(report);
        if(path.match(/^\/reports\/\d+\/referral$/)) return json({...referral,report_id:report.report_id});
        if(path.endsWith('/live-location')) return json({is_active:true,latitude:14.803,longitude:121.004,responder_name:'Earlier Team',updated_at:1});
        if(path==='/rescue-requests') return json([mission]);
        if(path.startsWith('/rescue-requests/report/')) return json(mission);
        if(path==='/referrals') return json([referral]);
        if(path==='/landmarks/barangay/1/hq') return json({barangay_id:1,barangay_name:'Synthetic Barangay',city:'Demo City',hq_lat:14.806906,hq_lng:121.0039297,contact_no:'',hq_plus_code:''});
        if(path==='/landmarks/jurisdictions') return json({barangays:[{barangay_id:1,barangay_name:'Synthetic Barangay'}],subdivisions:[{subdivision_id:1,subdivision_name:'Synthetic Subdivision',barangay_id:1}]});
        if(path==='/landmarks') return json(method==='GET'?landmarks:{...JSON.parse(postData),landmark_id:10});
        if(path.startsWith('/landmarks/')) return json(method==='GET'?landmarks[0]:{...JSON.parse(postData),landmark_id:5});
        if(path==='/users/42') return json(accountProfile);
        if(path==='/users') return json([accountProfile]);
        if(path==='/reports/coverage-area') return json({subdivision_id:1,center_latitude:14.801042,center_longitude:121.003648,radius_meters:1000,center_label:'Synthetic area'});
        if(path==='/matches/settings') return json({});
        if(path==='/holding/by-report/10') return json(null);
        if(path==='/owner-followups/pet/3/summary') return json({counts:{observations:0,repeated_incidents:0,verbal_warnings:0,account_warnings:0},observations:[],repeated_incidents:[]});
        if(path==='/warnings/pet/3') return json(warnings);
        if(path.startsWith('/pets/subdivision')) return json([{pet_id:3,created_at:recent}]);
        if(path.startsWith('/pets/3')) return json({pet_id:3,pet_name:'Synthetic Phase 2 Pet',pet_type:'Dog',owner_id:null,registration_type:'registered'});
        if(path==='/owner-followups/active-count') return json({count:0});
        return json([]);
    };
    const intercept = async ({requestId,request}) => {
        const url=new URL(request.url);
        if(url.pathname.endsWith('/src/components/MapComponent.tsx')) {
            await command('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(MAP_MODULE).toString('base64')}); return;
        }
        const {body,status}=url.pathname.startsWith('/api/')?answer(url,request.method,request.postData):json({});
        await command('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
    };
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const task = pending.get(message.id);
            if (!task) return;
            clearTimeout(task.timer); pending.delete(message.id);
            message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
        } else if (message.method === 'Page.loadEventFired') pageLoads++;
        else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => {
            // Navigation can cancel a paused request before its mocked response is fulfilled.
            if (!error.message.includes('Invalid InterceptionId.')) browserErrors.push(error.message);
        });
        else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        else if (message.method === 'Page.javascriptDialogOpening') { browserErrors.push('dialog: ' + message.params.message); command('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await command('DOM.enable');
    await command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Manila' });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: '*://*/src/components/MapComponent.tsx*' }, { urlPattern: '*nominatim.openstreetmap.org*' }, { urlPattern: '*tile.openstreetmap.org*' }, { urlPattern: '*basemaps.cartocdn.com*' }, { urlPattern: '*res.cloudinary.com*' }] });
    const evaluate = async expression => {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const waitFor = async (expression, label) => {
        for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
        throw new Error(`Timed out: ${label}; path=${await evaluate('location.pathname')}; errors: ${browserErrors.join('; ')}; text=${await evaluate('document.body.innerText.slice(0,1600)')}; calls=${JSON.stringify(calls.slice(-12))}`);
    };
    const text = () => evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    const clickText = (selector, label) => evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim().toUpperCase().includes(${JSON.stringify(label.toUpperCase())})); if (!el) return false; el.click(); return true; })()`);
    const setValue = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);

    await command('Page.addScriptToEvaluateOnNewDocument',{source:`
        localStorage.clear();sessionStorage.clear();
        const role=location.pathname.startsWith('/admin')||new URL(location.href).searchParams.get('portal')==='admin'?4:2;
        const user={user_id:42,role_id:role,name:'Synthetic Reviewer',subdivision_id:1,barangay_id:1,email:'reviewer@example.com',is_verified:true,access_token:'test.'+btoa(JSON.stringify({user_id:42,role_id:role,exp:4102444800}))+'.test'};
        localStorage.setItem(role===4?'admin_user':'staff_user',JSON.stringify(user));
        window.__phase2Alerts=[];window.alert=m=>window.__phase2Alerts.push(m);
        window.__phase2GpsDenied=false;
        Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(yes,no)=>window.__phase2GpsDenied?no({code:1,message:'denied'}):yes({coords:{latitude:14.801,longitude:121.003,accuracy:10},timestamp:Date.now()})}});
        window.__phase2Intervals=[];const originalInterval=window.setInterval;window.setInterval=(fn,ms,...args)=>{window.__phase2Intervals.push(ms);return originalInterval(fn,ms,...args)};
    `});
    const navigate = async path => {
        activeRole=path.startsWith('/admin')||path.includes('portal=admin')?4:2;
        const before=pageLoads;
        await command('Page.navigate',{url:base+path});
        for(let i=0;pageLoads<=before&&i<200;i++)await delay(100);
        assert.ok(pageLoads>before,'page loaded');
    };
    const click = async (selector,label) => assert.ok(await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent.trim().toLowerCase().includes(${JSON.stringify(label.toLowerCase())}));if(!el)return false;el.click();return true;})()`),'found '+label);
    const mapProps = () => evaluate(`[...document.querySelectorAll('[data-phase2-map]')].map(el=>JSON.parse(el.getAttribute('data-phase2-map')))`);

    for(const width of [1280,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
        const start=calls.length;
        await navigate('/subd/dashboard');
        await waitFor(`!!document.querySelector('[aria-label="Quick overview"]') && document.querySelector('[aria-label="Quick overview"]').innerText.includes('1')`,'dashboard counts');
        const overview=await evaluate(`document.querySelector('[aria-label="Quick overview"]').textContent`);
        assert.equal(/Pending Claims|At Barangay|animals held/i.test(overview),false,'retired dashboard shortcuts gone');
        const count=await evaluate(`[...document.querySelectorAll('[aria-label="Quick overview"] button')].find(el=>el.textContent.includes('Barangay Referrals')).textContent.trim()`);
        assert.ok(count.startsWith('1'),'only status 4 counted as current referral');
        assert.equal(/with Barangay HQ|Facility & claims|Recent Pet Claims/i.test(await text()),false,'no active custody/claims summaries');
        assert.equal(calls.slice(start).some(c=>/^\/(holding|claims|rescue-requests)/.test(c.path)),false,'dashboard no longer fetches retired queues');
        await click('[aria-label="Quick overview"] button','Barangay Referrals');
        await waitFor(`location.pathname==='/subd/reports' && new URLSearchParams(location.search).get('status')==='Referred to Barangay'`,'referral shortcut destination');
        console.log(`PASS ${width}px dashboard: current referrals separated and retired queues/shortcuts removed`);

        await navigate('/subd/endorsements');
        await waitFor(`document.body.innerText.includes('END-2026-008')`,'current and earlier letters');
        await evaluate(`[...document.querySelectorAll('button[aria-label]')].find(el=>el.getAttribute('aria-label').includes('Earlier demo endorsement')).click()`);
        await waitFor(`document.querySelector('[data-endorsement-provenance]')?.textContent.includes('Historical dispatch record')`,'legacy preview');
        const provenance=await evaluate(`document.querySelector('[data-endorsement-provenance]').textContent`);
        assert.match(provenance,/Historical dispatch record/);
        assert.ok((await text()).includes('Recorded Demo Responder'),'real earlier assignment preserved');
        assert.equal(/Awaiting active dispatch sync|updates automatically|squad dispatched and on-site|Animal secured/i.test(await text()),false,'no inferred live mission progress');
        assert.equal(await evaluate(`window.__phase2Intervals.includes(5000)`),false,'no 5-second mission polling');
        await navigate('/subd/endorsements');
        await waitFor(`document.body.innerText.includes('REF-001')`,'current referral');
        await evaluate(`[...document.querySelectorAll('button[aria-label]')].find(el=>el.getAttribute('aria-label').includes('Endorsement for Report #20')).click()`);
        await waitFor(`!!document.querySelector('[data-endorsement-provenance]')`,'current referral preview');
        assert.match(await evaluate(`document.querySelector('[data-endorsement-provenance]').textContent`),/updates are recorded by the Subdivision Leader/);
        console.log(`PASS ${width}px current referral provenance and historical endorsement/assignment without live polling`);

        for(const kind of ['sighting','referral','old-dispatch','custody','resolved-custody']) {
            report={...baseReport,report_id:10,status_id:kind==='old-dispatch'?5:kind==='referral'?4:kind==='resolved-custody'?11:kind==='custody'?7:2,
                custody_status:kind.includes('custody')?'In Barangay Facility':'Sighting',
                facility_id:kind.includes('custody')?5:null,facility:kind.includes('custody')?{name:'Actual Saved Care Place',latitude:14.804,longitude:121.005}:null,
                history:kind.includes('custody')?[{history_id:2,report_status_id:7,remarks:'Actual earlier intake to holding facility.',created_at:recent}]:[],
                latitude:kind==='custody'?14.804:baseReport.latitude,longitude:kind==='custody'?121.005:baseReport.longitude};
            report.current_status_id=report.status_id;
            const before=calls.length;
            await navigate('/subd/reports/10');
            await waitFor(`!!document.querySelector('[data-phase2-map]')`,'incident map');
            if(kind==='old-dispatch')await waitFor(`[...document.querySelectorAll('[data-phase2-map]')].some(el=>JSON.parse(el.getAttribute('data-phase2-map')).markers.some(m=>m.id===-777))`,'recorded position');
            let maps=await mapProps();
            for(const m of maps)assert.equal(m.hasHallDirections,false,'hall is not a response/navigation origin');
            const primary=maps[0].markers.find(m=>m.id===10);
            assert.equal(primary.lat,kind==='custody'?14.804:14.8018,'actual custody/current sighting position preserved');
            if(kind==='old-dispatch'){
                assert.match(maps[0].markers.find(m=>m.id===-777).title,/Recorded dispatch position/);
                assert.equal(await evaluate(`window.__phase2Intervals.includes(2500)`),false,'no responder live-location poller');
                assert.equal(calls.slice(before).filter(c=>c.path.endsWith('/live-location')).length,1,'earlier location read once');
            }else assert.equal(calls.slice(before).some(c=>c.path.endsWith('/live-location')),false,'current cases do not subscribe to dispatch');
            assert.equal(/Live Tracking Active|Barangay Dispatch Team En Route|Barangay Rescue Team \(Live\)/i.test(await text()),false,'no live responder claims');
            if(kind==='resolved-custody') assert.equal(maps[0].markers.find(m=>m.category==='Historical Holding').lat,14.804,'real earlier holding pin preserved');
            await click('button','Expand Map');
            await waitFor(`document.querySelectorAll('[data-phase2-map]').length===2`,'expanded map');
            maps=await mapProps();
            assert.deepEqual(maps[0].markers,maps[1].markers,'inline and expanded map markers agree');
        }
        report={...baseReport,status_id:11,current_status_id:11,facility_id:5,facility:{name:'Earlier place without coordinates'},
            history:[{history_id:1,report_status_id:7,remarks:'Earlier actual holding intake.',created_at:recent}]};
        await navigate('/subd/reports/10');
        await waitFor(`!!document.querySelector('[data-phase2-map]')`,'historical location without coordinates');
        assert.equal((await mapProps())[0].markers.some(m=>m.category==='Historical Holding'),false,'unknown historical facility is not placed at the hall');
        assert.equal(report.history[0].remarks,'Earlier actual holding intake.','saved historical event remains unchanged');
        await navigate('/subd/reports/10');
        await waitFor(`!!document.querySelector('[data-phase2-map]')`,'GPS test map');
        // Use a current, unresolved sighting to check viewer directions separately.
        report={...baseReport};
        await navigate('/subd/reports/10');
        await waitFor(`!!document.querySelector('[data-phase2-map] button')`,'viewer navigation');
        await click('[data-phase2-map] button','Directions from me');
        await waitFor(`JSON.parse(document.querySelector('[data-phase2-map]').getAttribute('data-phase2-map')).routing?.start?.[0]===14.801`,'viewer GPS route');
        await navigate('/subd/reports/10');
        await waitFor(`!!document.querySelector('[data-phase2-map] button')`,'GPS denial map');
        await evaluate(`window.__phase2GpsDenied=true`);
        await click('[data-phase2-map] button','Directions from me');
        await waitFor(`window.__phase2Alerts.length>0`,'GPS denial feedback');
        assert.equal((await mapProps())[0].routing,null,'GPS denial does not silently start from hall');
        console.log(`PASS ${width}px current/legacy/custody inline+expanded maps and GPS-only directions`);
    }
    for(const width of [1280,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
        for(const portal of ['admin','subd']) {
            await navigate(portal==='admin'?'/admin/account-settings':'/subd/settings');
            await waitFor(`document.body.innerText.toLowerCase().includes('landmarks')`,'settings ready');
            if(portal==='admin'){
                await click('button','Barangay Reference Location');
                await waitFor(`document.body.innerText.includes('Reference location only')`,'reference location tab');
                assert.equal(/Rescue Headquarters|deployment dispatch|Headquarters & Dispatch/i.test(await text()),false,'no operational HQ wording');
            }
            await click('button',portal==='admin'?'Landmarks & Earlier Records':'Reference Landmarks');
            await waitFor(`!!document.querySelector('[data-landmark-form]')`,'landmark form');
            assert.equal(await evaluate(`[...document.querySelector('[aria-label="Landmark category"]').options].some(o=>o.value==='facility')`),false,'new form cannot select holding-place category');
            assert.equal(await evaluate(`!!document.querySelector('[data-landmark-form] input[type="checkbox"]')`),false,'new form has no facility designation toggle');
            await setValue('[aria-label="Landmark name"]',`New ${portal} Reference`);
            await setValue('[aria-label="Landmark category"]','gate');
            const before=writes.length;
            await evaluate(`document.querySelector('[data-landmark-form]').requestSubmit()`);
            await waitFor(`!document.querySelector('[data-landmark-form] button[type="submit"]').disabled`,'landmark registration finishes');
            assert.ok(writes.slice(before).some(w=>w.method==='POST'&&w.path==='/landmarks'&&w.body.category==='gate'&&w.body.is_holding_facility===false&&w.body.facility_type===null),'normal landmark registration preserved');
            await evaluate(`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Edit').click()`);
            await waitFor(`document.querySelector('[aria-label="Landmark name"]').value==='Earlier Demo Shelter'`,'earlier metadata loaded');
            assert.equal(await evaluate(`document.querySelector('[aria-label="Historical facility type"]').value`),'Barangay Main Shelter','saved classification retained');
            assert.equal(await evaluate(`document.querySelector('[aria-label="Historical facility type"]').disabled`),true,'historical type is read-only');
            await setValue('[aria-label="Landmark name"]','Renamed Earlier Reference');
            const beforeEdit=writes.length;
            await evaluate(`document.querySelector('[data-landmark-form]').requestSubmit()`);
            await waitFor(`!document.querySelector('[data-landmark-form] button[type="submit"]').disabled`,'earlier landmark edit finishes');
            const edited=writes.slice(beforeEdit).find(w=>w.method==='PUT'&&w.path==='/landmarks/5');
            assert.ok(edited&&edited.body.is_holding_facility===true&&edited.body.facility_type==='Barangay Main Shelter'&&edited.body.latitude===14.802,'ordinary edit preserves earlier classification and coordinates');
            if(portal==='subd'){
                await click('button','Case Assignment & Takeover');
                await waitFor(`/External Referral Confirmation/i.test(document.body.innerText)`,'external referral confirmation preference');
                assert.equal(/Barangay Operations team|Save Dispatch Policies|Barangay Escalation Verification/i.test(await text()),false,'subdivision uses case/referral policy wording');
            }
            console.log(`PASS ${width}px ${portal} settings: reference wording, normal landmark creation and preserved historical metadata`);
        }
        for(const portal of ['admin','subd']) {
            reports[1].pet_id=3;
            await navigate('/tests/fixtures/retirementPhase2.html?portal='+portal);
            await waitFor(`document.body.textContent.includes('Synthetic Phase 2 Pet')`,'shared pet panel');
            await click('button','Pet History');
            await waitFor(`document.body.innerText.includes('Demo Warning One') || document.body.innerText.includes('DEMO WARNING ONE')`,'warning history');
            let history=await text();
            assert.ok(history.includes('Not recorded')&&history.includes('Actual Recorded Barangay Staff'),'missing issuer neutral; actual historical issuer preserved');
            assert.match(history,/Referred to Barangay/i,'current status-4 pet case uses referral wording');
            await click('button','Warnings (');
            await waitFor(`document.body.innerText.includes('Not recorded')`,'warning-only history');
            history=await text();
            assert.ok(history.includes('Actual Recorded Barangay Staff'),'warning-only filter preserves real issuer');
            await navigate('/tests/fixtures/retirementPhase2.html?portal='+portal+'&adopted=1');
            await waitFor(`!!document.querySelector('[data-testid="pet-adoption-lock"]')`,'earlier adoption lock');
            assert.ok(await evaluate(`document.querySelector('[data-testid="pet-adoption-lock"]').textContent.includes('Recorded Earlier Adopter')`),'recorded adopter and ownership lock preserved');
            console.log(`PASS ${width}px ${portal} shared pet history: neutral issuer fallback and original recorded issuer`);
        }
    }
    assert.equal(writes.some(w=>/^\/(reports|rescue-requests|holding|claims|pet-ownership)/.test(w.path)),false,'cleanup does not submit case/custody/ownership mutations');
    assert.equal(browserErrors.length,0,browserErrors.join('\n'));
    console.log('PASS Phase 2 B03-B07; API/map props mocked, real components exercised, no uncaught errors');
} finally {
    if (command) { try { await command('Browser.close'); } catch {} }
    socket?.close();
    browser.kill();
    const resolvedProfile = resolve(profile);
    if (resolvedProfile.startsWith(resolve(tmpdir()) + '\\straysafe-retirement-phase2-')) {
        await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
}
