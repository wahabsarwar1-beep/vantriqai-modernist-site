const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const ctx={exports:{},Date,JSON,Math,Number,String,Set,Array};vm.runInNewContext(transpile('lib/chat-blocks.ts'),ctx);const c=ctx.exports;
const plain=v=>JSON.parse(JSON.stringify(v));

// Text and blocks are separated; the fence never reaches the visitor.
let r=c.parseReply('Here you go.\n\n```vq\n{"type":"compare","title":"Packages","columns":["Starter","Growth"],"rows":[{"label":"WhatsApp","values":[true,true]},{"label":"CRM sync","values":[false,"Included"]}],"highlight":1}\n```\n\nWhich fits?');
assert.equal(r.text,'Here you go.\n\nWhich fits?');assert.equal(r.blocks.length,1);
assert.deepEqual(plain(r.blocks[0].rows[1]),{label:'CRM sync',values:[false,'Included']});assert.equal(r.blocks[0].highlight,1);

// Quoted booleans become ticks; a doubled closing fence never prints.
r=c.parseReply('Side by side:\n```vq\n[{"type":"compare","columns":["A","B"],"rows":[{"label":"24/7","values":["true","No"]}]}]\n```\n```');
assert.equal(r.text,'Side by side:');assert.deepEqual(plain(r.blocks[0].rows[0].values),[true,false]);

// Malformed JSON, unknown types and unclosed fences are dropped, never printed.
r=c.parseReply('Hi\n```vq\n{not json}\n```\n```vq\n{"type":"script","src":"x"}\n```\nBye\n```vq\n{"type":"cards"');
assert.equal(r.text,'Hi\n\nBye');assert.equal(r.blocks.length,0);

// Compare needs two columns and a row; rows are padded/trimmed to the columns.
assert.equal(c.parseReply('```vq\n{"type":"compare","columns":["A"],"rows":[{"label":"x","values":[1]}]}\n```').blocks.length,0);
r=c.parseReply('```vq\n{"type":"compare","columns":["A","B","C","D","E"],"rows":[{"label":"x","values":["1"]}],"highlight":9}\n```');
assert.equal(r.blocks[0].columns.length,4);assert.deepEqual(plain(r.blocks[0].rows[0].values),['1','','','']);assert.equal(r.blocks[0].highlight,undefined);

// Cards carry names, not links; actions only accept known destinations.
r=c.parseReply('```vq\n[{"type":"cards","items":[{"name":"Booking Agent","text":"Books slots","href":"https://evil.example"}]},{"type":"actions","items":[{"label":"Go","link":"https://evil.example"},{"label":"WhatsApp","link":"whatsapp"},{"label":"Ask","message":"Tell me more"}]}]\n```');
assert.deepEqual(plain(r.blocks[0].items[0]),{name:'Booking Agent',text:'Books slots'});
assert.deepEqual(plain(r.blocks[1].items),[{label:'WhatsApp',link:'whatsapp'},{label:'Ask',message:'Tell me more'}]);

// Package tables name packages only; the widget fills the cells from site data.
r=c.parseReply('```vq\n[{"type":"package_compare","packages":["Starter","Scale","Pro","Enterprise","Enterprise+"],"rows":[{"label":"Price","values":["PKR 1"]}]}]\r\n```');
assert.deepEqual(plain(r.blocks[0]),{type:'package_compare',packages:['Starter','Scale','Pro','Enterprise']});
assert.deepEqual(plain(c.parseReply('```vq\n{"type":"package_compare"}\n```').blocks[0]),{type:'package_compare'});

// One form/picker/suggestion row per reply; suggestions capped at four.
r=c.parseReply('```vq\n[{"type":"booking"},{"type":"booking"},{"type":"suggestions","items":["a","b","c","d","e"]}]\n```');
assert.equal(r.blocks.length,2);assert.equal(r.blocks[1].items.length,4);

// Booking slots: Pakistan time, no Sundays, nothing within two hours.
const now=new Date('2026-10-05T09:30:00Z'); // Monday 14:30 PKT
const days=c.bookingDays(now);assert.equal(days.length,6);assert.equal(days[0].key,'2026-10-05');
assert.deepEqual(plain(days[0].slots.map(s=>s.hour)),[17]);
assert.ok(days.every(d=>!d.label.startsWith('Sun')));assert.equal(days[5].key,'2026-10-10');
assert.equal(days[1].slots[0].startIso,'2026-10-06T11:00:00+05:00');
assert.equal(c.bookingMessage(days[1],days[1].slots[4]),'Please book my 15-minute discovery call on Tuesday 6 October 2026 at 3:00 pm Pakistan time (2026-10-06T15:00:00+05:00 to 2026-10-06T15:15:00+05:00). I confirm this slot.');
const late=c.bookingDays(new Date('2026-10-10T14:00:00Z')); // Saturday 19:00 PKT -> Monday next
assert.equal(late[0].key,'2026-10-12');

// Lead form: name plus one valid contact.
const d=(o)=>Object.assign({name:'Ali Khan',business:'',whatsapp:'',email:''},o);
assert.match(c.leadProblem(d({})),/WhatsApp number or an email/);assert.match(c.leadProblem(d({name:'A',email:'a@b.co'})),/name/);
assert.match(c.leadProblem(d({whatsapp:'123'})),/too short/);assert.match(c.leadProblem(d({email:'nope'})),/email/);
assert.equal(c.leadProblem(d({whatsapp:'+92 300 1234567'})),null);
assert.equal(c.leadMessage(d({business:'Khan Textiles',whatsapp:'+92 300 1234567'})),'Here are my details:\nName: Ali Khan\nBusiness: Khan Textiles\nWhatsApp: +92 300 1234567');

console.log('PASS: rich-reply blocks are validated and capped, package tables carry names only, malformed or unknown blocks are dropped, links are never taken from the model, booking slots are exact Pakistan-time ISO, lead details need a name and a valid contact.');
