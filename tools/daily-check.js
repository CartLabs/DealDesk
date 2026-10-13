#!/usr/bin/env node
/* The whole daily listing check. Runs every morning on Kevin's laptop (Windows Task Scheduler, set up by
   tools/install-daily-task.cmd), because Redfin blocks cloud servers and Claude's scheduled runs can't open web pages.
   node tools/daily-check.js [--commit]     --commit also saves the result to GitHub (commit + push to main).
   1. tools/pull-redfin.js writes rows.txt from each watched town's Redfin lists.
   2. tools/refresh-listings.js folds rows.txt into data/listings.js and data/watch-state.json.
   3. Tests and the version check run; if anything fails, or more than a third of existing listings changed
      at once, the data files are put back and nothing but the status file changes.
   Always writes data/last-check.json, which the 6:49am Claude task reads to send Kevin his alert.
   Prints the commit message on the last line of stdout ("" when the data did not change). */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),TMP=process.env.RUNNER_TEMP||require('os').tmpdir();
const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const run=(args,opts={})=>execFileSync(process.execPath,args,{cwd:ROOT,encoding:'utf8',maxBuffer:64<<20,...opts});
const status={date:day,ranAt:new Date().toISOString(),status:'ok',problem:null,towns:[],report:null};
const DATA=['data/listings.js','data/watch-state.json'];
const restore=()=>execFileSync('git',['checkout','--',...DATA],{cwd:ROOT});
const git=(...a)=>execFileSync('git',a,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','inherit']});
function finish(msg){
  fs.writeFileSync(path.join(ROOT,'data/last-check.json'),JSON.stringify(status,null,1)+'\n');console.log(msg||'');
  if(process.argv.includes('--commit')){
    git('add','--',...DATA,'data/last-check.json');
    try{git('diff','--cached','--quiet');}catch{ /* something staged */
      git('-c','user.name=DealDesk daily check','-c','user.email=noreply@cartlabs.local','commit','-q','-m',msg||`Daily listing check ${day}: status only`);
      /* GitHub sometimes rejects a push with a passing server error; wait and try again */
      for(let i=1;;i++){try{git('pull','-q','--rebase','origin','main');git('push','-q','origin','HEAD:main');console.log('Saved to GitHub');break;}
        catch(e){if(i>=4){console.error('Could not save to GitHub after 4 tries');process.exit(1);}console.error('Save to GitHub failed, trying again in a minute');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);}}}
  }
  process.exit(0);
}

const rows=path.join(TMP,'rows.txt'),log=path.join(TMP,'pull-log.json');
/* DEALDESK_TEST_ROWS/LOG: use saved files instead of pulling (for testing the steps after the pull) */
if(process.env.DEALDESK_TEST_ROWS){fs.copyFileSync(process.env.DEALDESK_TEST_ROWS,rows);fs.copyFileSync(process.env.DEALDESK_TEST_LOG,log);}
else try{run([path.join(__dirname,'pull-redfin.js'),'--out',rows,'--log',log],{stdio:['ignore','inherit','inherit']});}
catch(e){status.status='failed';status.problem='The Redfin pull crashed: '+String(e.message||e).slice(0,300);finish('');}
status.towns=JSON.parse(fs.readFileSync(log,'utf8')).towns;
const read=status.towns.filter(t=>t.forSale&&!t.forSale.error);
if(!read.length){status.status='failed';status.problem='No town could be read from Redfin (it may be blocking GitHub). First error: '+((status.towns[0]||{}).forSale||{}).error;finish('');}

global.window={};require(path.join(ROOT,'data/listings.js'));
const before=window.SEED_LISTINGS.filter(d=>!d.sold&&!d.gone).length;
let rep;
try{rep=JSON.parse(run([path.join(__dirname,'refresh-listings.js'),'--rows',rows,'--date',day]));}
catch(e){restore();status.status='aborted';status.problem='refresh-listings failed: '+String(e.message||e).slice(0,300);finish('');}
status.report=rep;
const changed=rep.priceChanges.length+rep.sold.length+rep.gone.length;
let problem=null;
if(rep.errors.length)problem='The listing update reported errors: '+rep.errors.slice(0,5).join('; ');
else if(before>0&&changed>before/3)problem=`${changed} of ${before} existing listings changed at once (${rep.priceChanges.length} price changes, ${rep.sold.length} sold, ${rep.gone.length} off the market), which looks wrong, so nothing was saved.`;
else{
  try{run(['--test','tools/test-calc.js','tools/test-sync.js','tools/test-lookup.js','tools/test-refresh.js','tools/test-pull.js']);run(['tools/check-version.js']);}
  catch(e){problem='Tests failed after the update: '+String(e.stdout||e.message||e).slice(-300);}
}
if(problem){restore();status.status='aborted';status.problem=problem;finish('');}
const dirty=execFileSync('git',['status','--porcelain','--',...DATA],{cwd:ROOT,encoding:'utf8'}).trim();
finish(dirty?`Daily listing check ${day}: ${rep.added} new, ${rep.sold.length} sold, ${rep.priceChanges.length} price changes`:'');
