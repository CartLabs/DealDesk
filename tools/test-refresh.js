const test=require('node:test'),assert=require('node:assert');
const {refresh}=require('./refresh-listings.js');
const towns={"Lowell|MA":{lat:42.633,lon:-71.316,rents:[1787,2050,2450,2925]}};
const base=()=>[{id:"ma-lowell-1-a-st",address:"1 A St",town:"Lowell",state:"MA",miles:3,units:2,price:500000,rent:4100,url:"https://www.redfin.com/MA/Lowell/1-A-St-01850/home/111"},
  {id:"old-style-id",address:"2 B St",town:"Lowell",state:"MA",miles:3,units:2,price:600000,rent:4100,url:"https://www.redfin.com/MA/Lowell/2-B-St-01850/home/222"}];
const NOW="2026-10-07T10:00:00Z";
test('adds new, matches by Redfin home number, records price change',()=>{
  const L=base(),S={};
  const r=refresh(L,S,towns,"#Lowell|MA\n2 B Street|550000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n9 New St|300000|3|9|3|MA/Lowell/9-New-St-01850/home/999\n",'',NOW);
  assert.equal(L.length,3);assert.equal(r.added,1);
  assert.equal(L[1].price,550000);assert.equal(L[1].priceWas,600000);assert.equal(r.priceChanges.length,1);
  assert.equal(r.newMatches.length,1);assert.equal(r.newMatches[0].address,"9 New St");
  assert.deepEqual(r.check.map(c=>c.id),["ma-lowell-1-a-st"]);
  assert.equal(L[0].sold,undefined); /* missing is never treated as sold */
});
test('sold only from a checked page; price can arrive later; nothing checked twice a day',()=>{
  const L=base(),S={};
  let r=refresh(L,S,towns,"#Lowell|MA\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n","ma-lowell-1-a-st|sold||2026-10-05\n",NOW);
  assert.deepEqual(L[0].sold,{date:"2026-10-05"});assert.equal(r.sold.length,1);assert.equal(r.check.length,0);
  r=refresh(L,S,towns,"#Lowell|MA\n2 B St|600000|2|6|2|MA/Lowell/2-B-St-01850/home/222\n",'',"2026-10-08T10:00:00Z");
  assert.equal(r.check[0].why,'sold, price not published yet');
  r=refresh(L,S,towns,'',"ma-lowell-1-a-st|sold|$480,000|2026-10-05\n","2026-10-08T10:00:00Z");
  assert.equal(L[0].sold.price,480000);assert.equal(r.sold[0].priceJustPublished,true);
});
test('a failed town pull flags nothing',()=>{
  const L=base(),S={};const r=refresh(L,S,towns,"#Lowell|MA\n",'',NOW);
  assert.equal(r.check.length,0);assert.equal(r.townsFailed.length,1);
});
