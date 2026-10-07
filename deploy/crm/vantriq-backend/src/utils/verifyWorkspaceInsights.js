// Read-only post-deploy check; emits no customer identifiers or figures.
require('dotenv').config();
const assert=require('node:assert/strict');
const db=require('../db');const {workspaceInsights}=require('./workspaceInsights');
(async()=>{
  for(const scope of ['sales','customers']){
    const d=await workspaceInsights({scope});
    assert.equal(d.scope,scope);
    assert.equal(d.pipeline.open,d.pipeline.age_0_7+d.pipeline.age_8_30+d.pipeline.age_31_60+d.pipeline.age_61_plus);
    assert.equal(d.appointments.total,d.trend.reduce((n,v)=>n+v.total,0));
    assert.ok(d.summary.won<=d.summary.leads);
  }
  console.log('Live workspace analytics: both scopes verified.');
})().catch(e=>{console.error('Workspace analytics verification failed: '+e.message);process.exitCode=1;}).finally(()=>db.pool.end());
