// Confere a limpeza de nomes do banco com linhas reais de extrato.
// Rodar: npx tsx scripts/check-clean-description.ts
import { cleanBankDescription as c } from "../src/lib/import/clean-description";
const cases: [string,string][] = [
["Card Purchase Facebk *Y6vpa76 7311 650-5434800 DE 19808 9889","Facebook"],
["Card Purchase Amazon.Com*5r1d 5942 Amzn.Com/Bill WA 98109 9889","Amazon"],
["Paid Overdraft Item Fee","Taxa de saldo negativo"],
["Zelle Credit From Aj Sushi LLC Ref# 626000f02gxg","Zelle · Aj Sushi LLC"],
["Zelle Debit to Michelle Fe Ref# 626100d013af","Zelle · Michelle Fe"],
["PIN Purchase Netflix.Com 4899 Los Gatos 9889","Netflix"],
["International Service Assessment Manus Ai","Taxa internacional · Manus Ai"],
["Card Purchase Manus Ai 5734 Singapore 17909 9889","Manus Ai"],
["Card Purchase Fxreplay 5817 Oklahoma City OK 73103 9889","Fxreplay"],
["FL Capital Greys Patob-P2p L Lourenco Fer 2884326","FL Capital Greys Patob-P2p L Lourenco Fer"],
["Card Purchase Doordash*09/07- 5812 Doordash.Com CA 94107 9889","DoorDash"],
["Card Purchase Topstep 7399 312-685-4261 IL 60661 9889","Topstep"],
["Andrade Bowers J3005 Ooff Levi Lourenco","Andrade Bowers J3005 Ooff Levi Lourenco"],
["Card Purchase DD *Doordash MC 5812 Doordash.Com CA 94107 9889","DoorDash"],
["Card Purchase DD *Doordashdas 7299 Doordash.Com CA 94107 9889","DoorDash"],
["Card Purchase Fiorella Prepar 8351 305-5288535 FL 32835 9889","Fiorella Prepar"],
["Card Purchase Yami Buffet 5814 Orlando FL 32835 9889","Yami Buffet"],
["Recurring Card Transaction Buffer Plan 7399 Buffer.Com CA 94115 9889","Buffer Plan"],
["PIN Purchase Publix Super M 5411 Orlando FL 9889","Publix"],
["Card Purchase Hywaze Kirkman 5993 Orlando FL 32819 9889","Hywaze Kirkman"],
["Recurring Card Transaction Massive.Com Dat 5734 Polygon.Io GA 30307 9889","Massive Dat"],
["Recurring Card Transaction Slate Digital 5045 323-656-2050 CA 90068 9889","Slate Digital"],
["Card Purchase Amazon Mktpl*53 5942 Amzn.Com/Bill WA 98109 9889","Amazon"],
["PIN Purchase Speedway 43431 5541 Orlando 9889","Speedway"],
["Recurring Card Transaction Sp Stltones.Com 5815 Stltones.Com TN 37206 9889","STL Tones"],
["Recurring Card Transaction Google Workspac 4816 650-2530000 CA 94043 9889","Google Workspace"],
["Recurring Card Transaction Netlify 5734 Netlify.Com CA 94104 9889","Netlify"],
["PIN Purchase Wal-Mart #1220 5411 Orlando 9889","Walmart"],
["Zelle Credit From Gold Striker Ref# 624400a03fnu","Zelle · Gold Striker"],
];
let fail=0; for (const [i,e] of cases){const g=c(i); if(g!==e){fail++; console.log("FAIL",JSON.stringify(i),"→",JSON.stringify(g),"esperado",JSON.stringify(e));}}
console.log(cases.length-fail,"/",cases.length); if (fail) process.exit(1);
