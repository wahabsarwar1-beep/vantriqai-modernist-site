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
          { id: 'cfg-page', name: 'facebookPageId', value: '61594465987920', type: 'string' },
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
  output: [{ contentBaseUrl: 'https://raw.githubusercontent.com/.../marketing/social-ads/', facebookPageId: '61594465987920', instagramAccountId: '', graphApiVersion: 'v23.0', requireApproval: true, approvalEmail: 'server@vantriqai.com', senderEmail: 'VantriqAI Social <server@vantriqai.com>', rotationStartDate: '2026-09-29', forceCardId: '' }]
});

const fetchQueue = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Fetch Caption Queue',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.contentBaseUrl }}captions.json?v={{ $now.toMillis() }}'),
      options: { response: { response: { responseFormat: 'text' } } }
    },
    position: [480, 400]
  },
  output: [{ data: '[{"id":"01","type":"image","image":"vantriqai-ad-01.png","headline":"Answer every customer in 1.2 seconds","facebook":"...","instagram":"..."}]' }]
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
        "if (!String(cfg.facebookPageId || '').trim()) throw new Error('Fill in facebookPageId in the Config node first.');\n" +
        "\n" +
        "const raw = $input.first().json.data;\n" +
        "const posts = typeof raw === 'string' ? JSON.parse(raw) : raw;\n" +
        "if (!Array.isArray(posts) || posts.length === 0) throw new Error('captions.json has no posts.');\n" +
        "\n" +
        "// A post with a date is posted on that day. Everything else, and dated posts\n" +
        "// whose day has passed, rotates one a day as the evergreen library.\n" +
        "const today = $today.toISODate();\n" +
        "let post;\n" +
        "let reason;\n" +
        "if (String(cfg.forceCardId || '').trim()) {\n" +
        "  post = posts.find(p => p.id === String(cfg.forceCardId).trim());\n" +
        "  if (!post) throw new Error('No post with id ' + cfg.forceCardId + ' in captions.json.');\n" +
        "  reason = 'forced in Config';\n" +
        "} else {\n" +
        "  post = posts.find(p => p.date === today);\n" +
        "  reason = 'scheduled for ' + today;\n" +
        "  if (!post) {\n" +
        "    const pool = posts.filter(p => !p.date || p.date < today);\n" +
        "    if (pool.length === 0) throw new Error('Nothing scheduled today and no evergreen posts to rotate.');\n" +
        "    const start = DateTime.fromISO(cfg.rotationStartDate, { zone: $now.zone });\n" +
        "    const days = Math.floor($today.diff(start.startOf('day'), 'days').days);\n" +
        "    post = pool[((days % pool.length) + pool.length) % pool.length];\n" +
        "    reason = 'evergreen rotation';\n" +
        "  }\n" +
        "}\n" +
        "\n" +
        "const isCarousel = post.type === 'carousel';\n" +
        "const files = isCarousel ? post.images : [post.image];\n" +
        "const imageUrls = files.map(f => cfg.contentBaseUrl + f);\n" +
        "\n" +
        "return [{ json: {\n" +
        "  id: post.id,\n" +
        "  type: isCarousel ? 'carousel' : 'image',\n" +
        "  reason,\n" +
        "  headline: post.headline,\n" +
        "  facebookCaption: post.facebook,\n" +
        "  instagramCaption: post.instagram,\n" +
        "  imageUrl: imageUrls[0],\n" +
        "  imageUrls,\n" +
        "  imageList: imageUrls.map((u, i) => (isCarousel ? 'Slide ' + (i + 1) + ': ' : '') + u).join('\\n'),\n" +
        "  facebookPageId: String(cfg.facebookPageId).trim(),\n" +
        "  instagramAccountId: String(cfg.instagramAccountId || '').trim(),\n" +
        "  graphApiVersion: cfg.graphApiVersion,\n" +
        "  requireApproval: cfg.requireApproval,\n" +
        "  approvalEmail: cfg.approvalEmail,\n" +
        "  senderEmail: cfg.senderEmail\n" +
        "} }];\n"
    },
    position: [720, 400]
  },
  output: [{ id: 'C01', type: 'carousel', reason: 'evergreen rotation', headline: '5 signs your inbox is costing you sales', facebookCaption: 'FB text', instagramCaption: 'IG text', imageUrl: 'https://raw.githubusercontent.com/.../vantriqai-carousel-01-1.png', imageUrls: ['https://raw.githubusercontent.com/.../vantriqai-carousel-01-1.png', 'https://raw.githubusercontent.com/.../vantriqai-carousel-01-2.png'], imageList: 'Slide 1: https://...\nSlide 2: https://...', facebookPageId: '61594465987920', instagramAccountId: '', graphApiVersion: 'v23.0', requireApproval: true, approvalEmail: 'server@vantriqai.com', senderEmail: 'VantriqAI Social <server@vantriqai.com>' }]
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
      subject: expr('Approve today\'s post? {{ $json.type === "carousel" ? "Carousel" : "Card" }} {{ $json.id }}: {{ $json.headline }}'),
      message: expr('Today\'s VantriqAI post is ready ({{ $json.type }}, {{ $json.reason }}).\n\n{{ $json.imageList }}\n\n--- FACEBOOK ---\n{{ $json.facebookCaption }}\n\n--- INSTAGRAM ---\n{{ $json.instagramCaption }}\n\nPublish it to the Facebook Page and Instagram? If nobody answers within 6 hours, today\'s post is skipped.'),
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

const readyToPublish = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Ready to Publish', position: [1680, 400] },
  output: [{}]
});

const findIgAccount = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Find Linked Instagram Account',
    onError: 'continueRegularOutput',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'GET',
      graphApiVersion: expr("{{ $('Pick Card of the Day').first().json.graphApiVersion }}"),
      node: expr("{{ $('Pick Card of the Day').first().json.facebookPageId }}"),
      options: { fields: { field: [{ name: 'instagram_business_account' }, { name: 'name' }] } }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [1920, 400]
  },
  output: [{ id: '61594465987920', name: 'VantriqAI', instagram_business_account: { id: '17841400000000000' } }]
});

const isCarousel = ifElse({
  version: 2.3,
  config: {
    name: 'Carousel?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $('Pick Card of the Day').first().json.type === 'carousel' }}"), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
        combinator: 'and'
      }
    },
    position: [2160, 400]
  }
});

const singleImage = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Single Image', position: [2280, 250] },
  output: [{}]
});

const IG_ID = "{{ $('Pick Card of the Day').first().json.instagramAccountId || $('Find Linked Instagram Account').first().json.instagram_business_account.id }}";
const GRAPH_V = "{{ $('Pick Card of the Day').first().json.graphApiVersion }}";
const PAGE_ID = "{{ $('Pick Card of the Day').first().json.facebookPageId }}";

const postToFacebook = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Post Photo to Facebook Page',
    onError: 'continueRegularOutput',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr(GRAPH_V),
      node: expr(PAGE_ID),
      edge: 'photos',
      options: {
        queryParameters: {
          parameter: [
            { name: 'url', value: expr("{{ $('Pick Card of the Day').first().json.imageUrl }}") },
            { name: 'message', value: expr("{{ $('Pick Card of the Day').first().json.facebookCaption }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [2420, 160]
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
      graphApiVersion: expr(GRAPH_V),
      node: expr(IG_ID),
      edge: 'media',
      options: {
        queryParameters: {
          parameter: [
            { name: 'image_url', value: expr("{{ $('Pick Card of the Day').first().json.imageUrl }}") },
            { name: 'caption', value: expr("{{ $('Pick Card of the Day').first().json.instagramCaption }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [2420, 340]
  },
  output: [{ id: '17900000000000000' }]
});

const waitForIg = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Let Instagram Process Image',
    parameters: { resume: 'timeInterval', amount: 30, unit: 'seconds' },
    position: [2660, 340]
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
      graphApiVersion: expr(GRAPH_V),
      node: expr(IG_ID),
      edge: 'media_publish',
      options: {
        queryParameters: {
          parameter: [
            { name: 'creation_id', value: expr("{{ $('Create Instagram Media').first().json.id }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [2900, 340]
  },
  output: [{ id: '17911111111111111' }]
});

const splitSlides = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'One Item per Slide',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const urls = $('Pick Card of the Day').first().json.imageUrls;\n" +
        "if (urls.length < 2 || urls.length > 10) throw new Error('A carousel needs 2 to 10 slides, this one has ' + urls.length + '.');\n" +
        "return urls.map((url, i) => ({ json: { url, slide: i + 1 } }));\n"
    },
    position: [2420, 620]
  },
  output: [{ url: 'https://raw.githubusercontent.com/.../vantriqai-carousel-01-1.png', slide: 1 }, { url: 'https://raw.githubusercontent.com/.../vantriqai-carousel-01-2.png', slide: 2 }]
});

const uploadFbSlide = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Upload Facebook Slide (unpublished)',
    onError: 'continueRegularOutput',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr(GRAPH_V),
      node: expr(PAGE_ID),
      edge: 'photos',
      options: {
        queryParameters: {
          parameter: [
            { name: 'url', value: expr('{{ $json.url }}') },
            { name: 'published', value: 'false' }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [2660, 540]
  },
  output: [{ id: '111' }, { id: '222' }]
});

const collectFbSlides = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Collect Facebook Slides',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const ids = $input.all().map(i => i.json.id).filter(Boolean);\n" +
        "if (ids.length < 2) throw new Error('Only ' + ids.length + ' Facebook slides uploaded; not posting a broken carousel.');\n" +
        "return [{ json: { attached_media: JSON.stringify(ids.map(id => ({ media_fbid: id }))), slides: ids.length } }];\n"
    },
    position: [2900, 540]
  },
  output: [{ attached_media: '[{"media_fbid":"111"},{"media_fbid":"222"}]', slides: 2 }]
});

const postFbCarousel = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Post Facebook Multi-Photo',
    onError: 'continueRegularOutput',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr(GRAPH_V),
      node: expr(PAGE_ID),
      edge: 'feed',
      options: {
        queryParameters: {
          parameter: [
            { name: 'message', value: expr("{{ $('Pick Card of the Day').first().json.facebookCaption }}") },
            { name: 'attached_media', value: expr('{{ $json.attached_media }}') }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [3140, 540]
  },
  output: [{ id: '123_456' }]
});

const createIgSlide = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Create Instagram Slide',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr(GRAPH_V),
      node: expr(IG_ID),
      edge: 'media',
      options: {
        queryParameters: {
          parameter: [
            { name: 'image_url', value: expr('{{ $json.url }}') },
            { name: 'is_carousel_item', value: 'true' }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [2660, 760]
  },
  output: [{ id: '1790001' }, { id: '1790002' }]
});

const collectIgSlides = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Collect Instagram Slides',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const ids = $input.all().map(i => i.json.id).filter(Boolean);\n" +
        "return [{ json: { children: ids.join(','), slides: ids.length } }];\n"
    },
    position: [2900, 760]
  },
  output: [{ children: '1790001,1790002', slides: 2 }]
});

const createIgCarousel = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Create Instagram Carousel',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr(GRAPH_V),
      node: expr(IG_ID),
      edge: 'media',
      options: {
        queryParameters: {
          parameter: [
            { name: 'media_type', value: 'CAROUSEL' },
            { name: 'children', value: expr('{{ $json.children }}') },
            { name: 'caption', value: expr("{{ $('Pick Card of the Day').first().json.instagramCaption }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [3140, 760]
  },
  output: [{ id: '1790009' }]
});

const waitForIgCarousel = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Let Instagram Process Carousel',
    parameters: { resume: 'timeInterval', amount: 45, unit: 'seconds' },
    position: [3380, 760]
  },
  output: [{ id: '1790009' }]
});

const publishIgCarousel = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Publish Instagram Carousel',
    parameters: {
      hostUrl: 'graph.facebook.com',
      httpRequestMethod: 'POST',
      graphApiVersion: expr(GRAPH_V),
      node: expr(IG_ID),
      edge: 'media_publish',
      options: {
        queryParameters: {
          parameter: [
            { name: 'creation_id', value: expr("{{ $('Create Instagram Carousel').first().json.id }}") }
          ]
        }
      }
    },
    credentials: { facebookGraphApi: newCredential('VantriqAI Page Access Token') },
    position: [3620, 760]
  },
  output: [{ id: '17911111111111111' }]
});

const setupNote = sticky(
  '## VantriqAI daily FB + IG post\n' +
  'Posts to facebook.com/profile.php?id=61594465987920 and instagram.com/vantriq_ai.\n\n' +
  '**Before activating:**\n' +
  '1. Instagram @vantriq_ai must be a Business account linked to the Page. Its ID is looked up from the Page, so `instagramAccountId` can stay blank.\n' +
  '2. Credential **VantriqAI Page Access Token** (Facebook Graph API) on every Facebook/Instagram node: a long-lived Page token with `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`.\n' +
  '3. Credential **VantriqAI SMTP** on the approval email (e.g. smtp.hostinger.com:465, server@vantriqai.com).\n\n' +
  '**What gets posted:** a post in captions.json dated today; otherwise the next evergreen post in rotation. Single images and carousels (2-10 slides) are both supported. `forceCardId` (e.g. C01) forces one for a test. `requireApproval` false skips the email.',
  [],
  { color: 5, position: [-40, -120], width: 620, height: 420 }
);

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
  .to(findIgAccount)
  .to(isCarousel
    .onFalse(singleImage)
    .onTrue(splitSlides))
  .add(singleImage)
  .to(postToFacebook)
  .add(singleImage)
  .to(createIgContainer)
  .to(waitForIg)
  .to(publishIg)
  .add(splitSlides)
  .to(uploadFbSlide)
  .to(collectFbSlides)
  .to(postFbCarousel)
  .add(splitSlides)
  .to(createIgSlide)
  .to(collectIgSlides)
  .to(createIgCarousel)
  .to(waitForIgCarousel)
  .to(publishIgCarousel);
