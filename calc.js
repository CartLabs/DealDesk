// Deal math for DealDesk. Used by index.html and by test/calc.test.js.
// Change formulas here only, then run: node --test
const DEFAULTS={maxPrice:1000000,minCF:200,minCoC:6,minDSCR:1.2,down:25,rate:7.25,term:30,closing:3,vac:5,maint:8,capex:7,mgmt:8};
function loanK(rate,term){const r=rate/1200,n=term*12;return r===0?1/term:12*r/(1-Math.pow(1+r,-n));}
function analyze(d,s,downOverride){
  const price=+d.price||0,units=Math.max(1,+d.units||1),rehab=+d.rehab||0;
  const taxEst=!(+d.taxes>0),insEst=!(+d.ins>0);
  const taxes=taxEst?price*(d.state==="NH"?0.019:0.012):+d.taxes;
  const ins=insEst?Math.max(1500,price*0.004):+d.ins;
  const gross=(+d.rent||0)*12, vacancy=gross*s.vac/100, egi=gross-vacancy;
  const maint=egi*s.maint/100,capex=egi*s.capex/100,mgmt=egi*s.mgmt/100,hoa=(+d.hoa||0)*12;
  const opex=taxes+ins+hoa+maint+capex+mgmt, noi=egi-opex;
  const dn=(downOverride??s.down)/100, cl=s.closing/100, k=loanK(s.rate,s.term);
  const loan=price*(1-dn), debt=loan*k, cf=noi-debt;
  const cash=price*(dn+cl)+rehab;
  const coc=cash>0?cf/cash*100:0, dscr=debt>0?noi/debt:0, cap=price>0?noi/price*100:0;
  const cfUnit=cf/12/units;
  // max price that satisfies each rule (NOI held constant)
  const m=s.minCoC/100;
  const byCF=(noi-s.minCF*units*12)/(k*(1-dn));
  const byDSCR=(noi/s.minDSCR)/(k*(1-dn));
  const byCoC=(noi-m*rehab)/(k*(1-dn)+m*(dn+cl));
  const cands=[["cash flow per unit",byCF],["debt coverage",byDSCR],["cash-on-cash return",byCoC],["price ceiling",s.maxPrice]];
  cands.sort((a,b)=>a[1]-b[1]);
  const maxOffer=Math.max(0,Math.floor(cands[0][1]/1000)*1000), binding=cands[0][0];
  const gap=price>0?(price-maxOffer)/price*100:0;
  const verdict=gap<=0?"Buy box":gap<=10?"Negotiate":"Pass";
  return {price,units,taxes,ins,taxEst,insEst,gross,vacancy,egi,maint,capex,mgmt,hoa,opex,noi,loan,debt,cf,cash,coc,dscr,cap,cfUnit,maxOffer,binding,gap,verdict,rentRatio:price>0?(+d.rent||0)/price*100:0};
}

if (typeof module !== "undefined") module.exports = { DEFAULTS, loanK, analyze };
