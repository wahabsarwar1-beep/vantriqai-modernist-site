// Shared, deterministic analytics. No external AI calls or cross-account benchmarks.
const TOPICS = [
  ['waiting', 'Waiting & speed', ['wait', 'waiting', 'queue', 'slow', 'delay', 'late', 'انتظار', 'دیر', 'سست', 'intezar', 'intizar', 'der']],
  ['staff', 'Staff & service', ['staff', 'cashier', 'rude', 'behaviour', 'behavior', 'support', 'service', 'عملہ', 'رویہ', 'بدتمیز', 'مدد', 'badtameez', 'rawaiya']],
  ['price', 'Price & value', ['price', 'pricing', 'expensive', 'cost', 'fees', 'charge', 'قیمت', 'مہنگ', 'فیس', 'mehnga', 'mehanga', 'qeemat']],
  ['quality', 'Product & quality', ['quality', 'broken', 'defect', 'cold', 'taste', 'food', 'معیار', 'خراب', 'ٹھنڈ', 'ذائق', 'kharab']],
  ['delivery', 'Delivery & order', ['delivery', 'courier', 'parcel', 'package', 'order', 'shipping', 'ڈلیوری', 'ڈیلیوری', 'پارسل', 'آرڈر']],
  ['access', 'Access & usability', ['website', 'app', 'login', 'payment', 'checkout', 'confusing', 'ویب', 'ایپ', 'لاگ', 'ادائیگی']],
];
const round = n => Math.round(n * 10) / 10;
const pct = (n, d) => d ? round(n / d * 100) : null;
const median = list => { const a = list.slice().sort((x,y)=>x-y); return a.length ? round(a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2) : null; };
const unhappy = r => (r.score != null && r.score <= 2) || (r.nps != null && r.nps <= 6) || r.resolved === false;
function topicMatches(text, term) {
  if (/^[a-z]+$/.test(term)) return new RegExp('(?:^|[^a-z])' + term + '(?:$|[^a-z])', 'i').test(text);
  return text.includes(term);
}
function measures(rows) {
  const scored=rows.filter(r=>r.score!=null), nps=rows.filter(r=>r.nps!=null);
  return { responses:rows.length, scored:scored.length, csat:pct(scored.filter(r=>r.score>=4).length,scored.length),
    nps:nps.length ? Math.round((nps.filter(r=>r.nps>=9).length-nps.filter(r=>r.nps<=6).length)/nps.length*100) : null,
    open:rows.filter(r=>['open','contacted'].includes(r.followup_status)).length };
}
function hours(start, end) { if(!start || !end) return null; const h=(+new Date(end)-+new Date(start))/3600000; return Number.isFinite(h)&&h>=0 ? h : null; }
function echoAdvanced(rows, { bounds, buckets, surveyNames, now=new Date() }) {
  const current=rows.filter(r=>+new Date(r.submitted_at)>=+new Date(bounds.cur_start));
  const previous=rows.filter(r=>+new Date(r.submitted_at)>=+new Date(bounds.prev_start)&&+new Date(r.submitted_at)<+new Date(bounds.prev_point));
  const comments=rows.filter(r=>unhappy(r)&&String(r.comment||'').trim());
  const topics=TOPICS.map(([key,label,terms])=>({key,label,terms,matched:[]}));
  const other={key:'other',label:'Other / unclassified',terms:[],matched:[]};
  for(const r of comments){const text=r.comment.toLowerCase();let matched=false;
    for(const topic of topics) if(topic.terms.some(t=>topicMatches(text,t))){topic.matched.push(r);matched=true;}
    if(!matched) other.matched.push(r);
  }
  const topicRows=[...topics,other].filter(t=>t.matched.length).map(t=>({key:t.key,label:t.label,count:t.matched.length,share:pct(t.matched.length,comments.length),
    series:buckets.map(bucket=>({bucket,count:t.matched.filter(r=>r.bucket===bucket).length})),
    samples:t.matched.slice(0,3).map(r=>({comment:r.comment,submitted_at:r.submitted_at,survey:surveyNames.get(r.survey_id)?.title||'',location:r.location_name||''}))
  })).sort((a,b)=>b.count-a.count);
  // Branch labels are unique within a client; identical labels across clients stay separate.
  const branchKey=r=>JSON.stringify([r.client_id, String(r.location_name||'').trim().toLowerCase()]);
  const groups=new Map(), previousGroups=new Map();
  for(const r of previous){const key=branchKey(r);if(!previousGroups.has(key))previousGroups.set(key,[]);previousGroups.get(key).push(r);}
  for(const r of current.filter(r=>String(r.location_name||'').trim())){const key=branchKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  const branches=[...groups.entries()].map(([key,list])=>{const prev=previousGroups.get(key)||[],m=measures(list),p=measures(prev);
    return {key,name:list[0].location_name,company:surveyNames.get(list[0].survey_id)?.company||'',...m,previous_csat:p.csat,previous_scored:p.scored,
      delta_pts:m.scored>=5&&p.scored>=5?round(m.csat-p.csat):null,low_sample:m.scored<5};
  }).sort((a,b)=>b.open-a.open||(a.csat??101)-(b.csat??101)||b.responses-a.responses);
  const followups=current.filter(r=>r.followup_status!=='none');
  const reply=followups.map(r=>hours(r.submitted_at,r.first_contacted_at)).filter(h=>h!=null);
  const resolution=followups.map(r=>hours(r.submitted_at,r.first_resolved_at)).filter(h=>h!=null);
  return {topics:{comment_count:comments.length,rows:topicRows},branches,
    unlocated_current:current.filter(r=>!String(r.location_name||'').trim()).length,
    service:{followups:followups.length,waiting:followups.filter(r=>r.followup_status==='open').length,
      overdue:followups.filter(r=>r.followup_status==='open'&&hours(r.submitted_at,now)>48).length,
      median_first_reply_hours:median(reply),median_resolution_hours:median(resolution),measured_replies:reply.length,measured_resolutions:resolution.length,
      replied_within_48_pct:pct(reply.filter(h=>h<=48).length,reply.length),
      missing_reply_timestamps:followups.filter(r=>['contacted','resolved'].includes(r.followup_status)&&!r.first_contacted_at).length}
  };
}
module.exports={echoAdvanced};
