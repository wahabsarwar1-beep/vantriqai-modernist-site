import { workflow, node, trigger, sticky, newCredential, ifElse, expr } from '@n8n/workflow-sdk';

const dailyTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Daily 10:00 (PKT)',
    parameters: {
      rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 10, triggerAtMinute: 0 }] },
      misfirePolicy: 'coalesce'
    },
    position: [0, 300]
  },
  output: [{}]
});

const manualTrigger = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Test Run', position: [0, 500] },
  output: [{}]
});

const config = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Config',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'cfg-base', name: 'contentBaseUrl', value: 'https://raw.githubusercontent.com/wahabsarwar1-beep/vantriqai-modernist-site/claude/zealous-thompson-g0lxu7/marketing/social-ads/', type: 'string' },
          { id: 'cfg-page', name: 'facebookPageId', value: '', type: 'string' },
          { id: 'cfg-ig', name: 'instagramAccountId', value: '', type: 'string' },
          { id: 'cfg-graph', name: 'graphApiVersion', value: 'v23.0', type: 'string' },
          { id: 'cfg-approval', name: 'requireApproval', value: true, type: 'boolean' },
          { id: 'cfg-to', name: 'approvalEmail', value: 'server@vantriqai.com', type: 'string' },
          { id: 'cfg-from', name: 'senderEmail', value: 'VantriqAI Social <server@vantriqai.com>', type: 'string' },
          { id: 'cfg-start', name: 'rotationStartDate', value: '2026-09-29', type: 'string' },
          { id: 'cfg-force', name: 'forceCardId', value: '', type: 'string' }
        ]
      }
    },
    position: [240, 400]
  },
  output: [{ contentBaseUrl: 'https://raw.githubusercontent.com/.../marketing/social-ads/', facebookPageId: '123', instagramAccountId: '178', graphApiVersion: 'v23.0', requireApproval: true, approvalEmail: 'server@vantriqai.com', senderEmail: 'VantriqAI Social <server@vantriqai.com>', rotationStartDate: '2026-09-29', forceCardId: '' }]
});

const fetchQueue = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Fetch Caption Queue',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.contentBaseUrl }}captions.json'),
      options: { response: { response: { responseFormat: 'text' } } }
    },
    position: [480, 400]
  },
  output: [{ data: '[{"id":"01","image":"vantriqai-ad-01.png","headline":"Answer every customer in 1.2 seconds","facebook":"...","instagram":"..."}]' }]
});

const pickPost = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Pick Card of the Day',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const cfg = $('Config').first().json;\n" +
        "const missing = ['facebookPageId', 'instagramAccountId'].filter(k => !String(cfg[k] || '').trim());\n" +
        "if (missing.length) throw new Error('Fill in ' + missing.join(' and ') + ' in the Config node first.');\n" +
        "\n" +
        "const raw = $input.first().json.data;\n" +
        "const posts = typeof raw === 'string' ? JSON.parse(raw) : raw;\n" +
        "if (!Array.isArray(posts) || posts.length === 0) throw new Error('captions.json has no posts.');\n" +
        "\n" +
        "let post;\n" +
        "if (String(cfg.forceCardId || '').trim()) {\n" +
        "  post = posts.find(p => p.id === String(cfg.forceCardId).trim());\n" +
        "  if (!post) throw new Error('No card with id ' + cfg.forceCardId + ' in captions.json.');\n" +
        "} else {\n" +
        "  const start = DateTime.fromISO(cfg.rotationStartDate, { zone: $now.zone });\n" +
        "  const days = Math.floor($today.diff(start.startOf('day'), 'days').days);\n" +
        "  const n = posts.length;\n" +
        "  post = posts[((days % n) + n) % n];\n" +
        "}\n" +
        "\n" +
        "return [{ json: {\n" +
        "  id: post.id,\n" +
        "  headline: post.headline,\n" +
        "  facebookCaption: post.facebook,\n" +
        "  instagramCaption: post.instagram,\n" +
        "  imageUrl: cfg.contentBaseUrl + post.image,\n" +
        "  facebookPageId: String(cfg.facebookPageId).trim(),\n" +
        "  instagramAccountId: String(cfg.instagramAccountId).trim(),\n" +
        "  graphApiVersion: cfg.graphApiVersion,\n" +
        "  requireApproval: cfg.requireApproval,\n" +
        "  approvalEmail: cfg.approvalEmail,\n" +
        "  senderEmail: cfg.senderEmail\n" +
        "} }];\n"
    },
    position: [720, 400]
  },
  output: [{ id: '01', headline: 'Answer every customer in 1.2 seconds', facebookCaption: 'FB text', instagramCaption: 'IG text', imageUrl: 'https://raw.githubusercontent.com/.../vantriqai-ad-01.png', facebookPageId: '123', instagramAccountId: '178', graphApiVersion: 'v23.0', requireApproval: true, approvalEmail: 'server@vantriqai.com', senderEmail: 'VantriqAI Social <server@vantriqai.com>' }]
});

const needsApproval = ifElse({
  version: 2.3,
  config: {
    name: 'Approval Required?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.requireApproval }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [960, 400]
  }
});

const approvalEmail = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: {
    name: 'Email Draft for Approval',
    parameters: {
      operation: 'sendAndWait',
      fromEmail: expr('{{ $json.senderEmail }}'),
      toEmail: expr('{{ $json.approvalEmail }}'),
      subject: expr('Approve today\'s post? Card {{ $json.id }}: {{ $json.headline }}'),
      message: expr('Today\'s VantriqAI post is ready.\n\nImage: {{ $json.imageUrl }}\n\n--- FACEBOOK ---\n{{ $json.facebookCaption }}\n\n--- INSTAGRAM ---\n{{ $json.instagramCaption }}\n\nPublish it to the Facebook Page and Instagram? If nobody answers within 6 hours, today\'s post is skipped.'),
      responseType: 'approval',
      approvalOptions: { values: { approvalType: 'double', approveLabel: 'Publish now', disapproveLabel: 'Skip today' } },
      options: {
        appendAttribution: false,
        limitWaitTime: { values: { limitType: 'afterTimeInterval', resumeAmount: 6, resumeUnit: 'hours' } }
      }
    },
    credentials: { smtp: newCredential('VantriqAI SMTP') },
    position: [1200, 300]
  },
  output: [{ data: { approved: true } }]
});

const isApproved = ifElse({
  version: 2.3,
  config: {
    name: 'Approved?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.data?.approved === true }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [1440, 300]
  }
});

const postToFacebook = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Post Photo to Facebook Page',
    onError: 'continueRegularOutput',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr("{{ $('Pick Card of the Day').item.json.graphApiVersion }}"),
      node: expr("{{ $('Pick Card of the Day').item.json.facebookPageId }}"),
      edge: 'photos',
      options: {
        queryParameters: {
          parameter: [
            { name: 'url', value: expr("{{ $('Pick Card of the Day').item.json.imageUrl }}") },
            { name: 'message', value: expr("{{ $('Pick Card of the Day').item.json.facebookCaption }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [1940, 300]
  },
  output: [{ id: '1234567890', post_id: '123_456' }]
});

const createIgContainer = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Create Instagram Media',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr("{{ $('Pick Card of the Day').item.json.graphApiVersion }}"),
      node: expr("{{ $('Pick Card of the Day').item.json.instagramAccountId }}"),
      edge: 'media',
      options: {
        queryParameters: {
          parameter: [
            { name: 'image_url', value: expr("{{ $('Pick Card of the Day').item.json.imageUrl }}") },
            { name: 'caption', value: expr("{{ $('Pick Card of the Day').item.json.instagramCaption }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [1940, 520]
  },
  output: [{ id: '17900000000000000' }]
});

const waitForIg = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Let Instagram Process Image',
    parameters: { resume: 'timeInterval', amount: 30, unit: 'seconds' },
    position: [2180, 520]
  },
  output: [{ id: '17900000000000000' }]
});

const publishIg = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Publish Instagram Post',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr("{{ $('Pick Card of the Day').item.json.graphApiVersion }}"),
      node: expr("{{ $('Pick Card of the Day').item.json.instagramAccountId }}"),
      edge: 'media_publish',
      options: {
        queryParameters: {
          parameter: [
            { name: 'creation_id', value: expr("{{ $('Create Instagram Media').item.json.id }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [2420, 520]
  },
  output: [{ id: '17911111111111111' }]
});

const setupNote = sticky(
  '## VantriqAI daily FB + IG post\n' +
  '**Before activating:**\n' +
  '1. Config: fill `facebookPageId` and `instagramAccountId` (the IG Business account linked to the Page).\n' +
  '2. Credential **VantriqAI Page Access Token** (Facebook Graph API): a long-lived Page token with `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`.\n' +
  '3. Credential **VantriqAI SMTP**: e.g. Hostinger smtp.hostinger.com:465 for server@vantriqai.com.\n' +
  '4. Workflow settings → Timezone: Asia/Karachi.\n\n' +
  'Cards rotate through `captions.json` one per day from `rotationStartDate`. Set `forceCardId` (e.g. 03) for a test run. Set `requireApproval` to false to post without the email check.',
  [],
  { color: 5, position: [-40, -60], width: 560, height: 360 }
);

const readyToPublish = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Ready to Publish', position: [1700, 400] },
  output: [{ data: { approved: true } }]
});

export default workflow('vantriqai-daily-social', 'VantriqAI · Daily Facebook + Instagram Post', { settings: { timezone: 'Asia/Karachi', executionOrder: 'v1' } })
  .add(setupNote)
  .add(dailyTrigger)
  .to(config)
  .add(manualTrigger)
  .to(config)
  .to(fetchQueue)
  .to(pickPost)
  .to(needsApproval
    .onTrue(approvalEmail.to(isApproved.onTrue(readyToPublish)))
    .onFalse(readyToPublish))
  .add(readyToPublish)
  .to(postToFacebook)
  .add(readyToPublish)
  .to(createIgContainer)
  .to(waitForIg)
  .to(publishIg);
