import { workflow, node, trigger, sticky, ifElse, languageModel, memory, tool, fromAi, expr } from '@n8n/workflow-sdk';

const verifyHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Meta verification (GET)',
    parameters: { httpMethod: 'GET', path: 'meta-messaging', responseMode: 'responseNode', options: {} },
    position: [-1200, -260]
  },
  output: [{ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '123' } }]
});

const answerVerification = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Answer Meta verification',
    parameters: {
      respondWith: 'text',
      responseBody: expr("{{ $json.query['hub.verify_token'] === 'vq-social-ba8a11ed193458e9c0eadd92c0b42e35' ? $json.query['hub.challenge'] : 'Forbidden' }}"),
      options: { responseCode: expr("{{ $json.query['hub.verify_token'] === 'vq-social-ba8a11ed193458e9c0eadd92c0b42e35' ? 200 : 403 }}") }
    },
    position: [-960, -260]
  }
});

const eventHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Meta messages (POST)',
    parameters: { httpMethod: 'POST', path: 'meta-messaging', responseMode: 'onReceived', options: { responseData: 'EVENT_RECEIVED' } },
    position: [-1200, 0]
  },
  output: [{ body: { object: 'instagram', entry: [{ id: '17841414904483393', messaging: [{ sender: { id: '123' }, recipient: { id: '17841414904483393' }, timestamp: 1791296416561, message: { mid: 'm1', text: 'Hi' } }] }] } }]
});

const readMessages = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Read messages',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// Turns Meta's webhook payload into one item per customer message we should answer.\n// Instagram DMs arrive as object 'instagram' (entry.id = the Instagram account);\n// Messenger as object 'page' (entry.id = the Facebook Page). Both are answered\n// through the Page, whose token the 'VantriqAI Page Access Token' credential holds.\nconst PAGE_ID = '1291897617346380';\nconst IG_ID = '17841414904483393';\n// Meta resends an event it thinks was not received; remember recent ids so a\n// customer is never answered twice. Kept between production runs only.\nconst memo = $getWorkflowStaticData('global');\nmemo.seen = Array.isArray(memo.seen) ? memo.seen : [];\nconst LABEL = { image: 'a photo', video: 'a video', audio: 'a voice note', file: 'a file', sticker: 'a sticker', share: 'a shared post', story_mention: 'a story that mentions VantriqAI', ig_reel: 'a reel', reel: 'a reel', animated_image_share: 'a GIF', location: 'a location', fallback: 'a link' };\nconst out = [];\nfor (const item of $input.all()) {\n  const body = item.json.body || item.json;\n  const object = body && body.object;\n  if (object !== 'page' && object !== 'instagram') continue;\n  const channel = object === 'instagram' ? 'instagram' : 'facebook';\n  for (const entry of body.entry || []) {\n    const accountId = String(entry.id || '');\n    if (accountId !== (channel === 'instagram' ? IG_ID : PAGE_ID)) continue;\n    for (const ev of entry.messaging || []) {\n      const senderId = String((ev.sender && ev.sender.id) || '');\n      if (!senderId || senderId === accountId || senderId === PAGE_ID || senderId === IG_ID) continue;\n      let text = '';\n      let kind = 'text';\n      let mid = '';\n      const m = ev.message;\n      if (m) {\n        if (m.is_echo || m.is_deleted || m.is_unsupported) continue;\n        mid = String(m.mid || '');\n        text = String(m.text || '').trim();\n        if (!text && m.quick_reply && m.quick_reply.payload) text = String(m.quick_reply.payload);\n        if (!text && Array.isArray(m.attachments) && m.attachments.length) {\n          kind = String(m.attachments[0].type || 'attachment');\n          text = '[The customer sent ' + (LABEL[kind] || 'an attachment') + ' with no text]';\n        }\n        if (text && m.reply_to && m.reply_to.story) text = '(Replying to our Instagram story) ' + text;\n      } else if (ev.postback) {\n        kind = 'postback';\n        mid = String(ev.postback.mid || '');\n        text = String(ev.postback.title || ev.postback.payload || '').trim();\n      } else {\n        continue;\n      }\n      if (!text) continue;\n      if (mid && memo.seen.includes(mid)) continue;\n      if (mid) memo.seen.push(mid);\n      const prefix = channel === 'instagram' ? 'ig-' : 'fb-';\n      out.push({ json: {\n        idx: out.length,\n        channel,\n        channel_name: channel === 'instagram' ? 'Instagram' : 'Messenger',\n        account_id: accountId,\n        page_id: PAGE_ID,\n        sender_id: senderId,\n        contact_key: prefix + senderId,\n        text: text.slice(0, 2000),\n        kind,\n        mid,\n        at: new Date(Number(ev.timestamp) || Date.now()).toISOString(),\n      }, pairedItem: { item: 0 } });\n    }\n  }\n}\nmemo.seen = memo.seen.slice(-300);\nreturn out;"
    },
    position: [-960, 0]
  },
  output: [{ idx: 0, channel: 'instagram', channel_name: 'Instagram', account_id: '17841414904483393', page_id: '1291897617346380', sender_id: '123', contact_key: 'ig-123', text: 'Hi', kind: 'text', mid: 'm1', at: '2026-10-06T14:00:00.000Z' }]
});

const mayWeAnswer = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Vantriq: may we answer?',
    parameters: {
      url: 'http://crm_app:8080/api/webhooks/service-status',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'external_ref', value: expr("{{ $('Read messages').item.json.account_id }}") }] },
      options: { response: { response: { neverError: true } }, timeout: 5000 }
    },
    credentials: { httpTemplatedCustomAuth: { id: '7NyQ8rUqlWKJcy76', name: 'Simplified Custom Auth account' } },
    onError: 'continueRegularOutput',
    position: [-720, 0]
  },
  output: [{ allow: true, reason: 'ok' }]
});

const okToAnswer = ifElse({
  version: 2.3,
  config: {
    name: 'Vantriq: OK to answer?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'allowed', leftValue: expr('{{ $json.allow !== false }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      },
      options: {}
    },
    position: [-480, 0]
  }
});

const showTyping = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Show typing',
    parameters: {
      httpRequestMethod: 'POST',
      graphApiVersion: 'v23.0',
      node: expr("{{ $('Read messages').item.json.page_id }}"),
      edge: 'messages',
      options: { queryParameters: { parameter: [
        { name: 'recipient', value: expr("{{ JSON.stringify({ id: $('Read messages').item.json.sender_id }) }}") },
        { name: 'sender_action', value: 'typing_on' }
      ] } }
    },
    credentials: { facebookGraphApi: { id: 'Mm6LHDKW0eJmiq0g', name: 'VantriqAI Page Access Token' } },
    onError: 'continueRegularOutput',
    position: [-240, -120]
  },
  output: [{ recipient_id: '123' }]
});

const lookUpName = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Look up their name',
    parameters: {
      graphApiVersion: 'v23.0',
      node: expr("{{ $('Read messages').item.json.sender_id }}"),
      options: { queryParameters: { parameter: [
        { name: 'fields', value: expr("{{ $('Read messages').item.json.channel === 'instagram' ? 'name,username' : 'first_name,last_name' }}") }
      ] } }
    },
    credentials: { facebookGraphApi: { id: 'Mm6LHDKW0eJmiq0g', name: 'VantriqAI Page Access Token' } },
    onError: 'continueRegularOutput',
    position: [0, -120]
  },
  output: [{ name: 'Ayesha Khan', username: 'ayesha.k', id: '123' }]
});

const lookUpKnowledge = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Vantriq: look up knowledge',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, mode: 'list', value: 'eqqOeoPJRJ9eu6gd', cachedResultName: 'VantriqAI - Knowledge Base (shared)' },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: { query: expr("{{ $('Read messages').item.json.text }}") },
        matchingColumns: [],
        schema: [{ id: 'query', displayName: 'query', required: false, display: true, canBeUsedToMatch: true, type: 'string' }]
      },
      options: { waitForSubWorkflow: true }
    },
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    position: [240, -120]
  },
  output: [{ answer: 'Knowledge base extract' }]
});

const chatModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: {
    name: 'OpenAI Chat Model',
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini', cachedResultName: 'gpt-4o-mini' }, options: {} },
    credentials: { openAiApi: { id: 'QS1gyYQ0V9jPVEtO', name: 'OpenAI – Wahab for VNTRIQ Whatsapp Agent' } },
    position: [360, 200]
  }
});

const chatMemory = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  version: 1.3,
  config: {
    name: 'Conversation Memory',
    parameters: { sessionIdType: 'customKey', sessionKey: expr("{{ $('Read messages').item.json.contact_key }}"), contextWindowLength: 12 },
    position: [500, 200]
  }
});

const kbSearch = tool({
  type: '@n8n/n8n-nodes-langchain.toolWorkflow',
  version: 2.2,
  config: {
    name: 'KB_Search',
    parameters: {
      description: 'Look up what VantriqAI actually offers: modules, packages, industries, integrations, onboarding, pricing policy, timelines and FAQ. Call it only when the knowledge base extract in your instructions does not cover the question. Pass the question in their own words. If it returns NO KNOWLEDGE BASE ENTRY MATCHED, do not guess - say you will confirm with the team.',
      workflowId: { __rl: true, mode: 'list', value: 'eqqOeoPJRJ9eu6gd', cachedResultName: 'VantriqAI - Knowledge Base (shared)' },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: { query: fromAi('query', 'The customer question, in their own words', 'string') },
        matchingColumns: [],
        schema: [{ id: 'query', displayName: 'query', required: false, display: true, canBeUsedToMatch: true, type: 'string' }]
      }
    },
    position: [640, 200]
  }
});

const saveLeadTool = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.5,
  config: {
    name: 'Save_Lead_To_CRM',
    parameters: {
      toolDescription: "Save this customer's details to the VantriqAI CRM. Call it AS SOON AS they tell you any of: their real name, business name, WhatsApp/phone number or email - and again whenever they add or correct one. Pass an empty string for anything they have not told you; never invent a value. Their chat is already filed as a lead automatically; this adds the details they give you.\n\nSUCCESS is ok: true (created: false is still success - it means we already had them). Thank them; never apologise. The response carries client_id.\n\nFAILURE is an error field or no ok field. Only then say their details did not reach us and ask them to message the team on WhatsApp at https://wa.me/923006789807.",
      method: 'POST',
      url: 'http://crm_app:8080/api/webhooks/lead',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ (() => { const r = $('Read messages').item.json; return JSON.stringify({ external_ref: r.contact_key, name: $fromAI('name', 'Their real full name as they told you. Empty string if not given.', 'string'), company: $fromAI('business', 'Their business or company name. Empty string if not given.', 'string'), email: $fromAI('email', 'Their email address. Empty string if not given.', 'string'), phone: $fromAI('phone', 'Their WhatsApp or phone number, digits only. Empty string if not given.', 'string'), channel: r.channel, source: r.channel_name, notes: [ 'Industry: ' + $fromAI('industry', 'Their industry', 'string'), 'Channel today: ' + $fromAI('channel_today', 'Which channel their customers use most now', 'string'), 'Daily volume: ' + $fromAI('volume', 'Roughly how many customer messages a day', 'string'), 'Wants handled: ' + $fromAI('needs', 'What they want the agent to handle', 'string'), 'Preferred call times: ' + $fromAI('preferred_time', 'Time windows that suit them for the discovery call', 'string'), '', $fromAI('summary', 'A short summary of what they asked and what you told them', 'string') ].join('\\n') }); })() }}"),
      options: { response: { response: { neverError: true } }, timeout: 8000 }
    },
    credentials: { httpTemplatedCustomAuth: { id: '7NyQ8rUqlWKJcy76', name: 'Simplified Custom Auth account' } },
    onError: 'continueRegularOutput',
    position: [780, 200]
  }
});

const bookTool = tool({
  type: '@n8n/n8n-nodes-langchain.toolWorkflow',
  version: 2.2,
  config: {
    name: 'Book_CRM_Meeting',
    parameters: {
      description: expr('Book a confirmed free 15-minute discovery call into the CRM Calendar. Use ONLY after the customer agrees an exact future date and time. Pakistan time is UTC+05:00; say so. Resolve relative dates against the current Pakistan time: {{ $now.setZone("Asia/Karachi").toISO() }}. Their real name is required: ask for it first if you do not have it. Say booked ONLY if the result has ok: true. On an error or a clash say it was not booked and ask for another time. Never repeat a successful booking.'),
      workflowId: { __rl: true, mode: 'id', value: 'vyuAAAGFbbD96mXu' },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {
          client_id: '',
          external_ref: expr("{{ $('Read messages').item.json.contact_key }}"),
          name: fromAi('customer_name', 'The customer real name, as they told you', 'string'),
          phone: '',
          channel: expr("{{ $('Read messages').item.json.channel }}"),
          starts_at: fromAi('starts_at', 'Confirmed future meeting start in ISO 8601 with the +05:00 offset. Exact date and year required.', 'string'),
          ends_at: fromAi('ends_at', 'Meeting end in ISO 8601 with the +05:00 offset, normally 15 minutes after the start.', 'string'),
          confirmed: fromAi('confirmed', 'true only when the customer explicitly agreed this exact date and time', 'boolean')
        },
        matchingColumns: [],
        schema: [
          { id: 'client_id', displayName: 'client_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'external_ref', displayName: 'external_ref', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'name', displayName: 'name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'starts_at', displayName: 'starts_at', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'ends_at', displayName: 'ends_at', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'confirmed', displayName: 'confirmed', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' }
        ],
        attemptToConvertTypes: false,
        convertFieldsToString: false
      }
    },
    position: [920, 200]
  }
});

const salesAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Social Sales Agent',
    parameters: {
      promptType: 'define',
      text: expr("{{ $('Read messages').item.json.text }}"),
      options: {
        systemMessage: expr("You are the VantriqAI Assistant, answering direct messages to VantriqAI on {{ $('Read messages').item.json.channel_name }}. VantriqAI (https://vantriqai.com, Islamabad) builds managed AI agents that answer a business's customers on WhatsApp, Instagram/Facebook and their website, qualify them and book appointments, around the clock. Most customers are businesses in Pakistan.\n\nYou are the Social Agent module working live: this DM is the product. At most once per conversation, and never in your first sentence, you may point out that this chat is the agent at work - in your own words.\n\nTheir profile name is {{ (() => { try { const p = $('Look up their name').item.json || {}; const n = p.name || [p.first_name, p.last_name].filter(Boolean).join(' '); return n || 'not available'; } catch (e) { return 'not available'; } })() }}{{ (() => { try { const u = $('Look up their name').item.json.username; return u ? ' (@' + u + ')' : ''; } catch (e) { return ''; } })() }}. It is a display name, not necessarily their real name; ask before you rely on it.\n\n# HOW YOU SELL\n- First message or greeting (\"hi\", \"price?\", \"info\", an emoji): never just \"How can I help?\". In one message greet them by first name if you have it, say concretely what VantriqAI does, name the three channels (WhatsApp Agent, Social Agent for Instagram/Facebook DMs, Website Agent), and ask what business they run.\n- Pain first, then outcome: the DM at 10pm nobody answers, the customer who buys from whoever replies first. Then what changes for THEM. Results, not features.\n- Make it about their business. Use their industry and words. One specific detail beats three generic ones.\n- Qualify while you help, one question per message: business and industry, which channel their customers use most, roughly how many messages a day, what they want handled.\n- When they tell you their business, name the two or three modules you would start them on, by their exact names from the knowledge base (for example Social Agent, Booking Agent, Escalation Desk), and what each would do on a normal day for a business like theirs. Do this before asking qualifying questions. That is where the deal is won.\n- Buying signals (price, cost, setup, how to start, demo, interested) mean they are warm: answer briefly, then offer the free 15-minute discovery call - we map their customer workflow and they get a written quote after. Ask only whether they would like the call; ask for their name and a time once they say yes.\n- Objections: acknowledge, reframe, next step. Staff: the agent covers nights, weekends and peaks; Escalation Desk hands the rest to a person with context. Bots are bad: slow, useless bots are; this one answers in their language, books, and hands over. AI makes mistakes: it answers from their own catalogue and FAQs and escalates judgement calls.\n\n# DM FORMAT - IMPORTANT\n- Instagram and Messenger show plain text only. NEVER use **, __, # headings, tables or [text](link). Write links as bare URLs.\n- Write like a person in a DM: short paragraphs, 40-120 words, at most one short list with \"- \" bullets. Fewer, fuller messages beat many small ones.\n- End with EXACTLY ONE question or one clear next step. Never two questions in one message: if you want to ask two things, pick the one that moves them forward and save the other.\n- Match their language: English, Urdu or Roman Urdu, or the same mix they use.\n- If they sent a photo, voice note or sticker with no text you cannot see or hear it: say so warmly and ask them to type their question.\n- If they mentioned us in their story or replied to one, thank them briefly, then move the conversation on.\n\n# FACTS - NON-NEGOTIABLE\nEverything about VantriqAI must come from the knowledge base. The extract for this message is at the end of these instructions: answer from it and do NOT call KB_Search for the same question. Call KB_Search only when the extract says NO EXTRACT or does not cover the question. If the knowledge base has nothing, say you will have the team confirm. No invented statistics, percentages, client names, testimonials, guarantees or timelines; quote any figure verbatim with its source.\n\n# LEADS AND BOOKINGS\n- This chat is already filed in the CRM. As soon as they tell you their real name, business, phone/WhatsApp or email, call Save_Lead_To_CRM with what you know (empty string for the rest). Say the team has their details only if it returned ok: true.\n- To book: get their real name and an exact future date and time in Pakistan time (UTC+05:00), confirm it back, and only when they agree call Book_CRM_Meeting with confirmed: true. Say booked ONLY on ok: true; otherwise say it was not booked and ask for another time. Reschedules and cancellations go to the team.\n\n# GUARDRAILS\n- NEVER quote or estimate a price, fee, discount or range: pricing is confirmed in writing after the discovery call, scoped on volume, integrations and modules.\n- Never promise a delivery date: \"typically a few weeks after scope sign-off\".\n- Redirect off-topic questions to their business. Never claim to be human; if asked, say you are VantriqAI's AI assistant.\n- Partnerships, reselling or jobs: the team handles those directly; ask what they have in mind and offer to pass their details on. Existing customers with a problem, upset customers, or anyone who asks for a person: stop selling, say a specialist will pick it up here, and offer WhatsApp: https://wa.me/923006789807\n\nCurrent Pakistan time: {{ $now.setZone('Asia/Karachi').toFormat('cccc d LLLL yyyy, HH:mm') }}.\n\n# KNOWLEDGE BASE EXTRACT FOR THIS MESSAGE\n{{ (() => { try { const a = $('Vantriq: look up knowledge').item.json.answer; return a ? String(a) : 'NO EXTRACT - call KB_Search before answering.'; } catch (e) { return 'NO EXTRACT - call KB_Search before answering.'; } })() }}"),
        maxIterations: 8,
        enableStreaming: false
      }
    },
    subnodes: { model: chatModel, memory: chatMemory, tools: [kbSearch, saveLeadTool, bookTool] },
    onError: 'continueErrorOutput',
    position: [480, -120]
  },
  output: [{ output: 'Assalam o alaikum Ayesha! ...' }]
});

const agentAnswered = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Agent answered',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [
        { id: 'o', name: 'output', type: 'string', value: expr('{{ $json.output }}') },
        { id: 'm', name: 'mode', type: 'string', value: 'agent' }
      ] },
      options: {}
    },
    position: [800, -200]
  },
  output: [{ output: 'Hello', mode: 'agent' }]
});

const noReplyWritten = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'No reply written: why',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// The AI model failed (a revoked OpenAI key, no credit, an outage). The customer\n// still gets a human sentence and a way through; the CRM records the failure and\n// emails the team.\nreturn $input.all().map((item, i) => ({\n  json: {\n    output: \"Sorry, I can't answer automatically just now. Our team has your message and will reply here soon. If it's urgent, WhatsApp us at https://wa.me/923006789807\",\n    mode: 'ai_failed',\n    error: 'The AI model failed: ' + String((item.error && (item.error.description || item.error.message)) || (item.json && item.json.error) || 'no reason given').slice(0, 450),\n  },\n  pairedItem: { item: i },\n}));"
    },
    position: [800, 40]
  },
  output: [{ output: 'Sorry', mode: 'ai_failed', error: 'x' }]
});

const pausedReply = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Vantriq: paused reply',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: { assignments: [
        { id: 'o', name: 'output', type: 'string', value: "Thanks for your message! We can't reply automatically right now, but the team has it and will get back to you here." },
        { id: 'm', name: 'mode', type: 'string', value: 'paused' }
      ] },
      options: {}
    },
    position: [-240, 200]
  },
  output: [{ output: 'Thanks', mode: 'paused' }]
});

const tidyForDm = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Tidy for DM',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// Instagram and Messenger show plain text: Markdown arrives as literal asterisks.\n// Converts what the model slips in, then splits anything over the channel's limit\n// (Instagram 1,000 bytes, Messenger 2,000 characters) at paragraph or sentence\n// breaks, so nothing is cut mid-word. One item per message to send.\nconst bytes = (s) => new TextEncoder().encode(s).length;\nconst out = [];\n$input.all().forEach((item, i) => {\n  const r = $('Read messages').itemMatching(i).json;\n  const raw = String(item.json.output || '').trim();\n  let text = raw\n    .replace(/```[a-z]*\\n?/gi, '')\n    .replace(/\\*\\*(.+?)\\*\\*/gs, '$1')\n    .replace(/__(.+?)__/gs, '$1')\n    .replace(/^[ \\t]{0,3}#{1,6}[ \\t]+(.+?)[ \\t]*$/gm, '$1')\n    .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g, '$1: $2')\n    .replace(/^[ \\t]*[*•][ \\t]+/gm, '- ')\n    .replace(/\\n{3,}/g, '\\n\\n')\n    .trim();\n  if (!text) text = \"Sorry, I didn't catch that. Could you say it another way?\";\n  const fits = r.channel === 'instagram' ? (s) => bytes(s) <= 950 : (s) => s.length <= 1900;\n  const parts = [];\n  let cur = '';\n  const pieces = text.split(/(\\n\\n|(?<=[.!?؟۔])\\s+)/);\n  for (const p of pieces) {\n    if (fits(cur + p)) { cur += p; continue; }\n    if (cur.trim()) parts.push(cur.trim());\n    cur = p;\n    while (!fits(cur)) {\n      let n = cur.length;\n      while (n > 1 && !fits(cur.slice(0, n))) n = Math.floor(n * 0.9);\n      parts.push(cur.slice(0, n).trim());\n      cur = cur.slice(n);\n    }\n  }\n  if (cur.trim()) parts.push(cur.trim());\n  parts.slice(0, 5).forEach((part, k) => out.push({\n    json: { idx: r.idx, part: k, parts: Math.min(parts.length, 5), text: part, full_text: text, mode: item.json.mode, error: item.json.error || '' },\n    pairedItem: { item: i },\n  }));\n});\nreturn out;"
    },
    position: [1040, -60]
  },
  output: [{ idx: 0, part: 0, parts: 1, text: 'Hello', full_text: 'Hello', mode: 'agent', error: '' }]
});

const sendReply = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Send reply',
    parameters: {
      httpRequestMethod: 'POST',
      graphApiVersion: 'v23.0',
      node: expr("{{ $('Read messages').item.json.page_id }}"),
      edge: 'messages',
      options: { queryParameters: { parameter: [
        { name: 'recipient', value: expr("{{ JSON.stringify({ id: $('Read messages').item.json.sender_id }) }}") },
        { name: 'messaging_type', value: 'RESPONSE' },
        { name: 'message', value: expr('{{ JSON.stringify({ text: $json.text }) }}') }
      ] } }
    },
    credentials: { facebookGraphApi: { id: 'Mm6LHDKW0eJmiq0g', name: 'VantriqAI Page Access Token' } },
    onError: 'continueRegularOutput',
    position: [1260, -60]
  },
  output: [{ recipient_id: '123', message_id: 'm_abc' }]
});

const collectSends = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'What reached them',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// One result per customer message: what we sent, whether Meta accepted every\n// part, and everything the CRM calls need, so they read only $json.\n// Each send is traced back through paired items, never by position.\nconst groups = new Map();\n$input.all().forEach((item, i) => {\n  const t = $('Tidy for DM').itemMatching(i).json;\n  const g = groups.get(t.idx) || { t, ids: [], errors: [], first: i };\n  // Meta's own reason (\"(#230) Requires pages_messaging permission\") beats n8n's summary.\n  const e = (item.error && (item.error.description || item.error.message)) || item.json.error;\n  if (e) g.errors.push(typeof e === 'string' ? e : (e.message || JSON.stringify(e)));\n  else if (item.json.message_id) g.ids.push(item.json.message_id);\n  else g.errors.push('Meta did not confirm the message.');\n  groups.set(t.idx, g);\n});\nconst out = [];\nfor (const g of groups.values()) {\n  const r = $('Read messages').itemMatching(g.first).json;\n  let p = {};\n  // Not run on the paused path, and refused when the token lacks the permission.\n  try { p = $('Look up their name').itemMatching(g.first).json || {}; } catch (e) {}\n  if (p.error) p = {};\n  const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ');\n  const failedSend = g.errors.length > 0;\n  out.push({\n    json: {\n      ...r,\n      contact_name: name || '',\n      username: p.username || '',\n      reply: g.t.full_text || '',\n      mode: g.t.mode,\n      sent_ids: g.ids,\n      delivered: !failedSend && g.t.mode !== 'ai_failed',\n      error: g.t.mode === 'ai_failed' ? g.t.error : failedSend ? r.channel_name + ' refused the reply: ' + String(g.errors[0]).slice(0, 400) : '',\n      session_id: r.contact_key + '-' + $now.setZone('Asia/Karachi').toFormat('yyyy-MM-dd'),\n    },\n    pairedItem: { item: g.first },\n  });\n}\nreturn out;"
    },
    position: [1480, -60]
  },
  output: [{ idx: 0, channel: 'instagram', channel_name: 'Instagram', account_id: '17841414904483393', page_id: '1291897617346380', sender_id: '123', contact_key: 'ig-123', text: 'Hi', kind: 'text', mid: 'm1', at: '2026-10-06T14:00:00.000Z', contact_name: 'Ayesha', username: 'ayesha.k', reply: 'Hello', mode: 'agent', sent_ids: ['m_abc'], delivered: true, error: '', session_id: 'ig-123-2026-10-06' }]
});

const agentRan = ifElse({
  version: 2.3,
  config: {
    name: 'Did the agent run?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'ran', leftValue: expr("{{ $json.mode === 'agent' }}"), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      },
      options: {}
    },
    position: [1700, -260]
  }
});

const recordUsage = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Vantriq: record this conversation',
    parameters: {
      method: 'POST',
      url: 'http://crm_app:8080/api/webhooks/usage',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ (() => { const c = $json; const est = (s) => { s = String(s || ''); let a = 0, w = 0; for (const ch of s) { if (ch.codePointAt(0) < 128) a++; else w++; } return Math.ceil(a / 4) + Math.ceil(w / 1.5); }; const SYSTEM_PROMPT_TOKENS = 2400; return JSON.stringify({ external_ref: c.account_id, session_id: c.session_id, channel: c.channel, ai_model: 'gpt-4o-mini', input_tokens: SYSTEM_PROMPT_TOKENS + est(c.text), output_tokens: est(c.reply), messages_count: 1, token_source: 'estimate:baseline+length', contact_name: c.contact_name }); })() }}"),
      options: { response: { response: { neverError: true } }, timeout: 8000 }
    },
    credentials: { httpTemplatedCustomAuth: { id: '7NyQ8rUqlWKJcy76', name: 'Simplified Custom Auth account' } },
    onError: 'continueRegularOutput',
    position: [1920, -260]
  },
  output: [{ ok: true }]
});

const saveTranscript = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Vantriq: save transcript',
    parameters: {
      method: 'POST',
      url: 'http://crm_app:8080/api/webhooks/conversation',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ (() => { const c = $json; const failedAi = c.mode === 'ai_failed'; return JSON.stringify({ external_ref: c.account_id, session_id: c.session_id, channel: c.channel, contact_name: c.contact_name, messages: [ { role: 'customer', content: c.text, at: c.at, id: c.mid || undefined }, { role: 'agent', content: failedAi ? '(No reply was written: the AI model failed. They were sent the apology.)' : c.reply, at: $now.toISO(), id: (c.sent_ids && c.sent_ids[0]) || (c.mid ? c.mid + ':reply' : undefined), delivered: c.delivered, error: c.delivered ? undefined : c.error } ] }); })() }}"),
      options: { response: { response: { neverError: true } }, timeout: 8000 }
    },
    credentials: { httpTemplatedCustomAuth: { id: '7NyQ8rUqlWKJcy76', name: 'Simplified Custom Auth account' } },
    onError: 'continueRegularOutput',
    position: [1920, -60]
  },
  output: [{ ok: true }]
});

const saveLead = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Vantriq: save lead',
    parameters: {
      method: 'POST',
      url: 'http://crm_app:8080/api/webhooks/lead',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpTemplatedCustomAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ (() => { const c = $json; return JSON.stringify({ external_ref: c.contact_key, name: c.contact_name, channel: c.channel, source: c.channel_name, notes: [ c.channel_name + ' DM' + (c.username ? ' from @' + c.username : '') + '.', '', 'Them: ' + String(c.text || ''), c.delivered ? 'Agent: ' + c.reply : 'No reply reached them (' + String(c.error || '').slice(0, 200) + '). Reply to them yourself from the inbox.' ].join('\\n') }); })() }}"),
      options: { response: { response: { neverError: true } }, timeout: 8000 }
    },
    credentials: { httpTemplatedCustomAuth: { id: '7NyQ8rUqlWKJcy76', name: 'Simplified Custom Auth account' } },
    onError: 'continueRegularOutput',
    position: [1920, 140]
  },
  output: [{ ok: true }]
});

const overview = sticky(
  "## VantriqAI - Instagram + Messenger agent\n\nThe same sales agent as the website and WhatsApp, answering Instagram DMs to @vantriq_ai and Messenger chats with the VantriqAI Page.\n\n**Meta webhook URL:** https://n8n.vantriqai.com/webhook/meta-messaging\n**Verify token:** vq-social-ba8a11ed193458e9c0eadd92c0b42e35 (not a secret key; it only proves the webhook is ours)\n\nSubscribe the Meta app (968515449639687) to `page` → messages, messaging_postbacks and `instagram` → messages, messaging_postbacks, and subscribe the Page to the app.\n\n**Token:** replies go out through **VantriqAI Page Access Token**. It needs pages_messaging, pages_manage_metadata, instagram_basic and instagram_manage_messages. The token that only publishes posts is refused (Forbidden).\n\n**CRM:** refs are the account the message arrived on (Instagram 17841414904483393, Page 1291897617346380) for usage and transcripts, and `ig-<id>` / `fb-<id>` per customer for leads. CRM v9.28 adds both agents and the facebook channel.\n\nEvery CRM call fails soft: an outage costs the row, never the reply.",
  [],
  { color: 4, position: [-1220, -640], width: 900, height: 340 }
);

export default workflow('vq-social', 'VantriqAI - Instagram + Messenger Agent')
  .add(verifyHook)
  .to(answerVerification)
  .add(eventHook)
  .to(readMessages)
  .to(mayWeAnswer)
  .to(okToAnswer
    .onTrue(showTyping.to(lookUpName).to(lookUpKnowledge).to(salesAgent))
    .onFalse(pausedReply.to(tidyForDm)))
  .add(salesAgent.output(0).to(agentAnswered))
  .add(agentAnswered.to(tidyForDm))
  .add(salesAgent.onError(noReplyWritten))
  .add(noReplyWritten.to(tidyForDm))
  .add(tidyForDm.to(sendReply).to(collectSends))
  .add(collectSends.to(agentRan.onTrue(recordUsage)))
  .add(collectSends.to(saveTranscript))
  .add(collectSends.to(saveLead))
  .add(overview);
