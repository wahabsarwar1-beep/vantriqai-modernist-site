/**
 * The survey template library — one ready-to-send questionnaire per industry.
 *
 * Each is what a customer-experience lead in that sector would actually ask:
 * a restaurant rates food, speed and value; a telco asks whether the issue was
 * resolved and how much effort it took; a hospital asks about waiting time and
 * whether the patient understood the treatment. Every template carries the
 * two headline measures — CSAT (1–5) and, where it fits, NPS (0–10) — so any
 * survey built from it feeds the Analytics dashboards the moment it is live.
 *
 * Every string is in English and Urdu. A respondent switches language with
 * one tap; a customer can edit either in the builder. "{business}" is
 * replaced with the survey's display name when the survey is shown.
 *
 * The builder edits a COPY — templates are never changed by a survey.
 */

const L = (en, ur) => ({ en, ur });

/* ------------------------------------------------------------------ */
/* The questions most templates share                                  */
/* ------------------------------------------------------------------ */

const csat = (en, ur, extra = {}) => ({
  id: 'csat', type: 'csat', style: 'emoji', required: true, title: L(en, ur), ...extra,
});

const nps = (en, ur) => ({
  id: 'nps', type: 'nps', required: true,
  title: L(
    en || 'How likely are you to recommend {business} to a friend or family member?',
    ur || 'اس بات کا کتنا امکان ہے کہ آپ {business} کی سفارش کسی دوست یا رشتہ دار سے کریں گے؟',
  ),
});

const grid = (rows, en, ur) => ({
  id: 'aspects', type: 'rating_grid', required: false,
  title: L(en || 'Please rate us on…', ur || 'ان پہلوؤں پر ہمیں ریٹ کریں'),
  help: L('Tap the stars for each one. Skip any that did not apply.', 'ہر ایک کے لیے ستارے منتخب کریں۔ جو لاگو نہ ہو اسے چھوڑ دیں۔'),
  rows: rows.map(([id, en2, ur2]) => ({ id, label: L(en2, ur2) })),
});

const choice = (id, en, ur, options, extra = {}) => ({
  id, type: 'single', required: false, title: L(en, ur),
  options: options.map(([oid, en2, ur2]) => ({ id: oid, label: L(en2, ur2) })), ...extra,
});

const yesno = (id, en, ur, extra = {}) => ({ id, type: 'yesno', required: false, title: L(en, ur), ...extra });

const ces = (en, ur) => ({ id: 'ces', type: 'ces', required: false, title: L(en, ur) });

// The follow-up that matters most is asked of the people who were not
// delighted; the ones who were get asked what to keep doing instead.
const improve = (en, ur, cond = { q: 'nps', op: 'lte', v: 8 }) => ({
  id: 'improve', type: 'text', required: false, multiline: true,
  title: L(en || 'What is the one thing we could do better?', ur || 'ہم کون سی ایک چیز بہتر کر سکتے ہیں؟'),
  show_if: cond,
});
const loved = (en, ur, cond = { q: 'nps', op: 'gte', v: 9 }) => ({
  id: 'loved', type: 'text', required: false, multiline: true,
  title: L(en || 'What did you like most?', ur || 'آپ کو سب سے زیادہ کیا پسند آیا؟'),
  show_if: cond,
});

// "About you": optional, near the end, and saved to the customer's profile as
// well as splitting the results (profile: gender / city / age).
const gender = () => ({
  id: 'gender', type: 'single', required: false, profile: 'gender',
  title: L('Are you…', 'آپ…'),
  options: [['male', 'Male', 'مرد'], ['female', 'Female', 'خاتون'], ['prefer_not', 'Prefer not to say', 'بتانا نہیں چاہتے']]
    .map(([id, en, ur]) => ({ id, label: L(en, ur) })),
});
const CITIES = [['karachi', 'Karachi', 'کراچی'], ['lahore', 'Lahore', 'لاہور'], ['islamabad', 'Islamabad', 'اسلام آباد'],
  ['rawalpindi', 'Rawalpindi', 'راولپنڈی'], ['faisalabad', 'Faisalabad', 'فیصل آباد'], ['multan', 'Multan', 'ملتان'],
  ['peshawar', 'Peshawar', 'پشاور'], ['quetta', 'Quetta', 'کوئٹہ'], ['hyderabad', 'Hyderabad', 'حیدرآباد'],
  ['sialkot', 'Sialkot', 'سیالکوٹ'], ['gujranwala', 'Gujranwala', 'گوجرانوالہ']];
const city = () => ({
  id: 'city', type: 'single', required: false, profile: 'city', allow_other: true,
  title: L('Which city are you in?', 'آپ کس شہر میں ہیں؟'),
  options: CITIES.map(([id, en, ur]) => ({ id, label: L(en, ur) })),
});
const age = () => ({
  id: 'age', type: 'single', required: false, profile: 'age',
  title: L('Your age group', 'آپ کی عمر کا گروپ'),
  options: [['u18', 'Under 18', '18 سے کم'], ['18_24', '18–24', '18–24'], ['25_34', '25–34', '25–34'], ['35_44', '35–44', '35–44'],
    ['45_54', '45–54', '45–54'], ['55_64', '55–64', '55–64'], ['65p', '65+', '65+']].map(([id, en, ur]) => ({ id, label: L(en, ur) })),
});

// A written answer everyone is asked, not only the happy or the unhappy.
const openText = (id, en, ur) => ({ id, type: 'text', required: false, multiline: true, title: L(en, ur) });

const contact = (fields = ['name', 'phone']) => ({
  id: 'contact', type: 'contact', required: false, fields,
  title: L('Would you like us to get back to you?', 'کیا آپ چاہتے ہیں کہ ہم آپ سے رابطہ کریں؟'),
  help: L('Leave your details only if you would like a reply.', 'اگر آپ جواب چاہتے ہیں تو ہی اپنی تفصیلات دیں۔'),
});

const content = (introEn, introUr, extra = {}) => ({
  intro: L(introEn, introUr),
  thanks: L('Thank you! Your feedback goes straight to our team.', 'شکریہ! آپ کی رائے براہِ راست ہماری ٹیم تک پہنچتی ہے۔'),
  ...extra,
});

const VALUE = ['value', 'Value for money', 'قیمت کے لحاظ سے معیار'];
const CLEAN = ['clean', 'Cleanliness', 'صفائی ستھرائی'];

/* ------------------------------------------------------------------ */
/* The library                                                          */
/* ------------------------------------------------------------------ */

const TEMPLATES = [
  {
    key: 'restaurant', icon: '🍽️', name: 'Restaurant & café',
    description: 'Dine-in, takeaway and delivery — food, service, speed, cleanliness and value.',
    content: content(
      'Thanks for eating with {business}! Tell us how we did — it takes less than a minute.',
      '{business} میں کھانا کھانے کا شکریہ! ہمیں بتائیں کہ ہم نے کیسا کیا — اس میں ایک منٹ سے بھی کم وقت لگتا ہے۔',
    ),
    questions: [
      choice('order_type', 'How did you order today?', 'آج آپ نے کیسے آرڈر کیا؟', [
        ['dine_in', 'Dine-in', 'ریسٹورنٹ میں بیٹھ کر'],
        ['takeaway', 'Takeaway', 'ٹیک اوے'],
        ['delivery', 'Home delivery', 'ہوم ڈیلیوری'],
      ], { required: true }),
      csat('Overall, how satisfied are you with your experience?', 'مجموعی طور پر آپ اپنے تجربے سے کتنے مطمئن ہیں؟'),
      grid([
        ['food', 'Taste and quality of food', 'کھانے کا ذائقہ اور معیار'],
        ['service', 'Friendliness of staff', 'عملے کا رویہ'],
        ['speed', 'Speed of service', 'سروس کی رفتار'],
        CLEAN,
        VALUE,
      ]),
      nps(),
      improve(),
      loved(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'fmcg_consumer', icon: '🛒', name: 'FMCG — product feedback',
    description: 'What shoppers think of your products: quality, packaging, value, availability and repeat purchase.',
    setup_hint: 'Replace the sample product names with your own range before you share it.',
    content: content(
      'Thank you for choosing {business}. Tell us what you think of our product — it takes a minute.',
      '{business} کی مصنوعات منتخب کرنے کا شکریہ۔ ہمیں بتائیں کہ آپ کو ہماری پروڈکٹ کیسی لگی — اس میں صرف ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('product', 'Which product are you reviewing?', 'آپ کس پروڈکٹ کے بارے میں رائے دے رہے ہیں؟', [
        ['product_1', 'Product A', 'پروڈکٹ A'],
        ['product_2', 'Product B', 'پروڈکٹ B'],
        ['product_3', 'Product C', 'پروڈکٹ C'],
      ], { required: true, allow_other: true }),
      csat('How satisfied are you with the product?', 'آپ اس پروڈکٹ سے کتنے مطمئن ہیں؟'),
      grid([
        ['quality', 'Quality', 'معیار'],
        ['taste', 'Taste or performance', 'ذائقہ یا کارکردگی'],
        ['packaging', 'Packaging', 'پیکنگ'],
        VALUE,
        ['availability', 'Easy to find in shops', 'دکانوں پر آسانی سے دستیاب'],
      ], 'Please rate the product on…', 'ان پہلوؤں پر پروڈکٹ کو ریٹ کریں'),
      choice('bought_at', 'Where did you buy it?', 'آپ نے یہ کہاں سے خریدی؟', [
        ['kiryana', 'Local shop or kiryana store', 'قریبی دکان یا کریانہ اسٹور'],
        ['supermarket', 'Supermarket', 'سپر مارکیٹ'],
        ['online', 'Online', 'آن لائن'],
        ['pharmacy', 'Pharmacy', 'فارمیسی'],
      ], { allow_other: true }),
      yesno('buy_again', 'Would you buy it again?', 'کیا آپ یہ دوبارہ خریدیں گے؟'),
      nps('How likely are you to recommend {business} products to a friend or family member?',
        'اس بات کا کتنا امکان ہے کہ آپ {business} کی مصنوعات کی سفارش کسی دوست یا رشتہ دار سے کریں گے؟'),
      improve('How could we make this product better?', 'ہم اس پروڈکٹ کو کیسے بہتر بنا سکتے ہیں؟'),
      age(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'fmcg_trade', icon: '🏪', name: 'FMCG — retailer & distributor',
    description: 'Trade-partner satisfaction: stock, on-time delivery, order accuracy, sales-rep support and schemes.',
    content: content(
      '{business} values your partnership. Tell us how we are doing as your supplier — it takes two minutes.',
      '{business} آپ کی شراکت داری کی قدر کرتا ہے۔ ہمیں بتائیں کہ بطور سپلائر ہماری کارکردگی کیسی ہے — اس میں دو منٹ لگتے ہیں۔',
    ),
    questions: [
      choice('partner_type', 'Which best describes your business?', 'آپ کا کاروبار کس قسم کا ہے؟', [
        ['retailer', 'Retailer or shopkeeper', 'ریٹیلر یا دکاندار'],
        ['wholesaler', 'Wholesaler', 'ہول سیلر'],
        ['distributor', 'Distributor', 'ڈسٹری بیوٹر'],
        ['modern_trade', 'Supermarket or modern trade', 'سپر مارکیٹ یا ماڈرن ٹریڈ'],
      ], { required: true }),
      csat('Overall, how satisfied are you with {business} as a supplier?', 'مجموعی طور پر آپ {business} سے بطور سپلائر کتنے مطمئن ہیں؟'),
      grid([
        ['stock', 'Stock availability', 'اسٹاک کی دستیابی'],
        ['delivery', 'On-time delivery', 'بروقت ڈیلیوری'],
        ['accuracy', 'Order accuracy', 'آرڈر کی درستگی'],
        ['sales_rep', 'Sales representative support', 'سیلز نمائندے کا تعاون'],
        ['schemes', 'Margins and trade schemes', 'منافع اور ٹریڈ اسکیمیں'],
        ['claims', 'Handling of damages and returns', 'خراب مال اور واپسی کا انتظام'],
      ]),
      choice('visits', 'How often does our sales representative visit you?', 'ہمارا سیلز نمائندہ کتنی بار آپ کے پاس آتا ہے؟', [
        ['weekly', 'Every week', 'ہر ہفتے'],
        ['fortnightly', 'Every two weeks', 'ہر دو ہفتے'],
        ['monthly', 'Once a month', 'مہینے میں ایک بار'],
        ['rarely', 'Rarely', 'بہت کم'],
      ]),
      ces('How easy is it to place an order with us?', 'ہمیں آرڈر دینا کتنا آسان ہے؟'),
      nps('How likely are you to recommend {business} to another trader?',
        'اس بات کا کتنا امکان ہے کہ آپ {business} کی سفارش کسی دوسرے تاجر سے کریں گے؟'),
      improve(),
      contact(['name', 'company', 'phone']),
    ],
  },
  {
    key: 'telecom', icon: '📶', name: 'Telecom & internet',
    description: 'After a support contact: resolution, effort, coverage, speed, call quality and billing clarity.',
    content: content(
      'Thanks for being with {business}. Tell us about your recent experience — it takes a minute.',
      '{business} کے ساتھ رہنے کا شکریہ۔ اپنے حالیہ تجربے کے بارے میں بتائیں — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('reason', 'What did you contact us about?', 'آپ نے ہم سے کس سلسلے میں رابطہ کیا؟', [
        ['billing', 'Bill or balance', 'بل یا بیلنس'],
        ['network', 'Network or coverage', 'نیٹ ورک یا کوریج'],
        ['internet', 'Internet speed', 'انٹرنیٹ کی رفتار'],
        ['package', 'Package or bundle change', 'پیکج یا بنڈل کی تبدیلی'],
        ['new_connection', 'New connection or SIM', 'نیا کنکشن یا سم'],
        ['complaint', 'A complaint', 'شکایت'],
      ], { required: true, allow_other: true }),
      csat('How satisfied are you with the help you received?', 'آپ کو ملنے والی مدد سے آپ کتنے مطمئن ہیں؟'),
      yesno('resolved', 'Was your issue resolved?', 'کیا آپ کا مسئلہ حل ہو گیا؟', { metric: 'resolved', required: true }),
      ces('How easy was it to get your issue handled?', 'اپنا مسئلہ حل کروانا کتنا آسان تھا؟'),
      grid([
        ['coverage', 'Network coverage', 'نیٹ ورک کوریج'],
        ['speed', 'Internet speed', 'انٹرنیٹ کی رفتار'],
        ['call_quality', 'Call quality', 'کال کا معیار'],
        ['billing', 'Clarity of bills and charges', 'بل اور چارجز کی وضاحت'],
        VALUE,
      ]),
      nps(),
      improve(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'healthcare', icon: '🩺', name: 'Hospital & clinic',
    description: 'Patient experience: the doctor, nursing, waiting time, hygiene, reception and clarity of fees.',
    content: content(
      'Thank you for trusting {business} with your care. Your answers help us improve — it takes a minute.',
      'اپنے علاج کے لیے {business} پر اعتماد کرنے کا شکریہ۔ آپ کے جوابات ہمیں بہتر بنانے میں مدد دیتے ہیں — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('service', 'What did you visit us for?', 'آپ کس سلسلے میں تشریف لائے؟', [
        ['opd', 'Doctor consultation (OPD)', 'ڈاکٹر سے معائنہ (او پی ڈی)'],
        ['lab', 'Lab tests', 'لیبارٹری ٹیسٹ'],
        ['radiology', 'X-ray, ultrasound or scan', 'ایکسرے، الٹراساؤنڈ یا اسکین'],
        ['emergency', 'Emergency', 'ایمرجنسی'],
        ['admission', 'Admission or surgery', 'داخلہ یا آپریشن'],
        ['pharmacy', 'Pharmacy', 'فارمیسی'],
        ['online', 'Online consultation', 'آن لائن مشورہ'],
      ], { required: true }),
      csat('Overall, how satisfied are you with your visit?', 'مجموعی طور پر آپ اپنے دورے سے کتنے مطمئن ہیں؟'),
      grid([
        ['doctor', "Doctor's care and explanation", 'ڈاکٹر کی توجہ اور وضاحت'],
        ['nursing', 'Nurses and staff', 'نرسز اور عملہ'],
        ['waiting', 'Waiting time', 'انتظار کا وقت'],
        ['hygiene', 'Cleanliness and hygiene', 'صفائی اور حفظانِ صحت'],
        ['reception', 'Reception and appointments', 'استقبالیہ اور اپائنٹمنٹ'],
        ['fees', 'Clarity of fees', 'فیس کی وضاحت'],
      ]),
      yesno('understood', 'Did you understand your diagnosis and treatment plan?', 'کیا آپ کو اپنی تشخیص اور علاج کا طریقہ سمجھ آیا؟'),
      nps(),
      improve(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'retail', icon: '🛍️', name: 'Retail store',
    description: 'In-store experience: availability, staff help, checkout speed, cleanliness and prices.',
    content: content(
      'Thanks for shopping at {business}! Tell us how your visit went — it takes a minute.',
      '{business} سے خریداری کا شکریہ! ہمیں بتائیں کہ آپ کا تجربہ کیسا رہا — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      csat('How satisfied are you with your shopping experience today?', 'آج کی خریداری کے تجربے سے آپ کتنے مطمئن ہیں؟'),
      yesno('found_all', 'Did you find everything you were looking for?', 'کیا آپ کو ہر وہ چیز مل گئی جس کی آپ کو تلاش تھی؟'),
      grid([
        ['availability', 'Product availability', 'اشیاء کی دستیابی'],
        ['staff', 'Staff helpfulness', 'عملے کی مدد'],
        ['checkout', 'Checkout speed', 'بلنگ کاؤنٹر کی رفتار'],
        ['clean', 'Store cleanliness', 'اسٹور کی صفائی'],
        ['prices', 'Prices', 'قیمتیں'],
      ]),
      nps(),
      improve(),
      loved(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'ecommerce', icon: '📦', name: 'Online store & delivery',
    description: 'Post-order: ease of ordering, delivery speed, packaging, product accuracy and support.',
    content: content(
      'Thanks for your order from {business}! How did we do? It takes a minute.',
      '{business} سے آرڈر کرنے کا شکریہ! ہماری کارکردگی کیسی رہی؟ اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      csat('How satisfied are you with your order?', 'آپ اپنے آرڈر سے کتنے مطمئن ہیں؟'),
      yesno('on_time', 'Did your order arrive on time?', 'کیا آپ کا آرڈر وقت پر پہنچا؟'),
      grid([
        ['ordering', 'Ease of ordering', 'آرڈر کرنے میں آسانی'],
        ['delivery', 'Delivery speed', 'ڈیلیوری کی رفتار'],
        ['packaging', 'Packaging', 'پیکنگ'],
        ['as_described', 'Product matched its description', 'پروڈکٹ تفصیل کے مطابق تھی'],
        ['support', 'Customer support', 'کسٹمر سپورٹ'],
      ]),
      ces('How easy was it to shop with us?', 'ہم سے خریداری کرنا کتنا آسان تھا؟'),
      nps(),
      improve(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'hotel', icon: '🏨', name: 'Hotel & guest house',
    description: 'The stay: check-in, room, cleanliness, staff, dining, Wi-Fi and value.',
    content: content(
      'Thank you for staying with {business}. Tell us about your stay — it takes two minutes.',
      '{business} میں قیام کرنے کا شکریہ۔ اپنے قیام کے بارے میں بتائیں — اس میں دو منٹ لگتے ہیں۔',
    ),
    questions: [
      choice('purpose', 'What brought you here?', 'آپ کس مقصد سے تشریف لائے؟', [
        ['business', 'Business', 'کاروباری دورہ'],
        ['leisure', 'Holiday', 'چھٹیاں'],
        ['family', 'Family visit', 'خاندانی دورہ'],
        ['event', 'Event or wedding', 'تقریب یا شادی'],
      ]),
      csat('Overall, how satisfied are you with your stay?', 'مجموعی طور پر آپ اپنے قیام سے کتنے مطمئن ہیں؟'),
      grid([
        ['checkin', 'Check-in and check-out', 'چیک اِن اور چیک آؤٹ'],
        ['room', 'Room comfort', 'کمرے کا آرام'],
        CLEAN,
        ['staff', 'Staff', 'عملہ'],
        ['dining', 'Food and dining', 'کھانا'],
        ['wifi', 'Wi-Fi', 'وائی فائی'],
        VALUE,
      ]),
      nps(),
      improve(),
      loved(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'banking', icon: '🏦', name: 'Bank & financial services',
    description: 'Branch, app or helpline: task completion, effort, courtesy, waiting time and charges.',
    content: content(
      'Thank you for banking with {business}. Tell us about your experience today — it takes a minute.',
      '{business} کے ساتھ بینکاری کا شکریہ۔ آج کے تجربے کے بارے میں بتائیں — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('channel', 'How did you bank with us today?', 'آج آپ نے کس ذریعے سے بینکاری کی؟', [
        ['branch', 'At a branch', 'برانچ میں'],
        ['app', 'Mobile app', 'موبائل ایپ'],
        ['online', 'Internet banking', 'انٹرنیٹ بینکنگ'],
        ['atm', 'ATM', 'اے ٹی ایم'],
        ['helpline', 'Call centre or helpline', 'کال سینٹر یا ہیلپ لائن'],
      ], { required: true }),
      csat('How satisfied are you with the service you received?', 'آپ کو ملنے والی سروس سے آپ کتنے مطمئن ہیں؟'),
      yesno('resolved', 'Did we complete what you came for?', 'کیا آپ کا کام مکمل ہو گیا؟', { metric: 'resolved', required: true }),
      ces('How easy was it to get it done?', 'یہ کام کروانا کتنا آسان تھا؟'),
      grid([
        ['courtesy', 'Staff courtesy', 'عملے کا رویہ'],
        ['knowledge', 'Staff knowledge', 'عملے کی معلومات'],
        ['waiting', 'Waiting time', 'انتظار کا وقت'],
        ['digital', 'App and online banking', 'ایپ اور آن لائن بینکنگ'],
        ['charges', 'Clarity of charges', 'چارجز کی وضاحت'],
      ]),
      nps(),
      improve(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'education', icon: '🎓', name: 'School, college & university',
    description: 'Parents and students: teaching, communication, facilities, safety, administration and fees.',
    content: content(
      'Your views help {business} improve. This survey takes two minutes.',
      'آپ کی رائے {business} کو بہتر بنانے میں مدد دیتی ہے۔ اس سروے میں دو منٹ لگتے ہیں۔',
    ),
    questions: [
      choice('role', 'You are a…', 'آپ ہیں…', [
        ['parent', 'Parent or guardian', 'والدین یا سرپرست'],
        ['student', 'Student', 'طالب علم'],
        ['alumni', 'Former student', 'سابق طالب علم'],
      ], { required: true }),
      csat('Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'),
      grid([
        ['teaching', 'Quality of teaching', 'تدریس کا معیار'],
        ['communication', 'Communication with families', 'والدین سے رابطہ'],
        ['facilities', 'Facilities', 'سہولیات'],
        ['safety', 'Safety and discipline', 'حفاظت اور نظم و ضبط'],
        ['admin', 'Administration and fees office', 'انتظامیہ اور فیس آفس'],
        ['value', 'Value for fees', 'فیس کے لحاظ سے معیار'],
      ]),
      nps(),
      improve(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'real_estate', icon: '🏠', name: 'Real estate',
    description: 'Buyers, sellers and tenants: responsiveness, market knowledge, honesty and paperwork.',
    content: content(
      'Thank you for choosing {business}. How did we do? It takes a minute.',
      '{business} کا انتخاب کرنے کا شکریہ۔ ہماری کارکردگی کیسی رہی؟ اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('stage', 'Where are you in your property search?', 'جائیداد کی تلاش میں آپ کس مرحلے پر ہیں؟', [
        ['enquiry', 'Just enquired', 'صرف معلومات لی ہیں'],
        ['viewing', 'Visited a property', 'جائیداد دیکھ چکے ہیں'],
        ['deal', 'Bought, sold or rented', 'خرید، فروخت یا کرایہ مکمل'],
      ], { required: true }),
      csat('How satisfied are you with our service?', 'آپ ہماری سروس سے کتنے مطمئن ہیں؟'),
      grid([
        ['response', 'Speed of response', 'جواب دینے کی رفتار'],
        ['knowledge', 'Knowledge of the market', 'مارکیٹ کی معلومات'],
        ['honesty', 'Honesty and transparency', 'ایمانداری اور شفافیت'],
        ['options', 'Suitable options shown', 'مناسب آپشنز دکھائے گئے'],
        ['paperwork', 'Paperwork and process', 'کاغذی کارروائی اور طریقہ کار'],
      ]),
      nps(),
      improve(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'automotive', icon: '🚗', name: 'Car sales & service',
    description: 'Showroom and workshop: fixed first time, advisor, work quality, on-time and price transparency.',
    content: content(
      'Thanks for visiting {business}. Tell us how we did — it takes a minute.',
      '{business} تشریف لانے کا شکریہ۔ ہمیں بتائیں کہ ہم نے کیسا کام کیا — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('visit', 'What was your visit for?', 'آپ کس کام کے لیے تشریف لائے؟', [
        ['purchase', 'Buying a vehicle', 'گاڑی کی خریداری'],
        ['service', 'Periodic service', 'پیریاڈک سروس'],
        ['repair', 'Repair', 'مرمت'],
        ['parts', 'Parts or accessories', 'پرزے یا ایکسیسریز'],
        ['bodywork', 'Denting and painting', 'ڈینٹنگ پینٹنگ'],
      ], { required: true }),
      csat('Overall, how satisfied are you with your visit?', 'مجموعی طور پر آپ اپنے دورے سے کتنے مطمئن ہیں؟'),
      yesno('fixed', 'Was the job done right the first time?', 'کیا کام پہلی بار ہی درست طریقے سے ہو گیا؟', { metric: 'resolved' }),
      grid([
        ['advisor', 'Service advisor', 'سروس ایڈوائزر'],
        ['quality', 'Quality of work', 'کام کا معیار'],
        ['on_time', 'Ready on time', 'وقت پر تیار'],
        ['pricing', 'Price transparency', 'قیمت کی شفافیت'],
        ['facility', 'Waiting area and facility', 'انتظار گاہ اور سہولیات'],
      ]),
      nps(),
      improve(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'logistics', icon: '🚚', name: 'Courier & logistics',
    description: 'Deliveries: on time, parcel condition, rider courtesy, tracking and cash on delivery.',
    content: content(
      'Thanks for using {business}. How was your delivery? It takes a minute.',
      '{business} استعمال کرنے کا شکریہ۔ آپ کی ڈیلیوری کیسی رہی؟ اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      csat('How satisfied are you with your delivery?', 'آپ اپنی ڈیلیوری سے کتنے مطمئن ہیں؟'),
      yesno('on_time', 'Did your parcel arrive on time?', 'کیا آپ کا پارسل وقت پر پہنچا؟'),
      grid([
        ['speed', 'Delivery speed', 'ڈیلیوری کی رفتار'],
        ['condition', 'Parcel condition', 'پارسل کی حالت'],
        ['rider', "Rider's behaviour", 'رائیڈر کا رویہ'],
        ['tracking', 'Tracking updates', 'ٹریکنگ اپ ڈیٹس'],
        ['cod', 'Cash on delivery handling', 'کیش آن ڈیلیوری کا انتظام'],
      ]),
      ces('How easy was it to send or receive your parcel?', 'پارسل بھیجنا یا وصول کرنا کتنا آسان تھا؟'),
      nps(),
      improve(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'salon_fitness', icon: '💇', name: 'Salon, spa & fitness',
    description: 'Service quality: staff skill, hygiene, punctuality, ambience and value.',
    content: content(
      'Thanks for visiting {business}! How was your experience? It takes a minute.',
      '{business} تشریف لانے کا شکریہ! آپ کا تجربہ کیسا رہا؟ اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('service', 'Which service did you have?', 'آپ نے کون سی سروس لی؟', [
        ['hair', 'Hair', 'بال'],
        ['skin', 'Skin and facial', 'جلد اور فیشل'],
        ['nails', 'Nails', 'ناخن'],
        ['massage', 'Massage and spa', 'مساج اور اسپا'],
        ['fitness', 'Gym or fitness class', 'جم یا فٹنس کلاس'],
      ], { allow_other: true }),
      csat('How satisfied are you with your service?', 'آپ اپنی سروس سے کتنے مطمئن ہیں؟'),
      grid([
        ['skill', 'Skill of the staff', 'عملے کی مہارت'],
        ['hygiene', 'Hygiene', 'صفائی اور حفظانِ صحت'],
        ['punctuality', 'Punctuality', 'وقت کی پابندی'],
        ['ambience', 'Ambience', 'ماحول'],
        VALUE,
      ]),
      nps(),
      improve(),
      loved(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'travel', icon: '✈️', name: 'Travel & tourism',
    description: 'Trips, tours and Umrah packages: booking, itinerary, support on the trip, hotels and value.',
    content: content(
      'Thanks for travelling with {business}. How was your trip? It takes a minute.',
      '{business} کے ساتھ سفر کرنے کا شکریہ۔ آپ کا سفر کیسا رہا؟ اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('trip', 'What kind of trip was it?', 'یہ کس قسم کا سفر تھا؟', [
        ['umrah', 'Umrah or Hajj', 'عمرہ یا حج'],
        ['domestic', 'Domestic tour', 'اندرونِ ملک سیاحت'],
        ['international', 'International holiday', 'بیرونِ ملک چھٹیاں'],
        ['business', 'Business travel', 'کاروباری سفر'],
        ['flights', 'Flights only', 'صرف ٹکٹ'],
      ]),
      csat('Overall, how satisfied are you with your trip?', 'مجموعی طور پر آپ اپنے سفر سے کتنے مطمئن ہیں؟'),
      grid([
        ['booking', 'Booking experience', 'بکنگ کا تجربہ'],
        ['itinerary', 'Itinerary and planning', 'سفری منصوبہ بندی'],
        ['support', 'Support during the trip', 'سفر کے دوران مدد'],
        ['hotels', 'Hotels and transport', 'ہوٹل اور ٹرانسپورٹ'],
        VALUE,
      ]),
      nps(),
      improve(),
      loved(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'professional', icon: '💼', name: 'Professional services',
    description: 'Legal, consulting and accounting: outcome, expertise, responsiveness, communication and fees.',
    content: content(
      'Thank you for working with {business}. Your feedback helps us serve you better — it takes a minute.',
      '{business} کے ساتھ کام کرنے کا شکریہ۔ آپ کی رائے ہمیں بہتر خدمت میں مدد دیتی ہے — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      csat('How satisfied are you with our work?', 'آپ ہمارے کام سے کتنے مطمئن ہیں؟'),
      yesno('resolved', 'Did we achieve what you needed?', 'کیا ہم نے آپ کی ضرورت پوری کی؟', { metric: 'resolved' }),
      grid([
        ['expertise', 'Expertise', 'مہارت'],
        ['responsiveness', 'Responsiveness', 'بروقت جواب'],
        ['communication', 'Clear communication', 'واضح رابطہ'],
        ['timeliness', 'Delivered on time', 'وقت پر کام'],
        ['value', 'Value for fees', 'فیس کے لحاظ سے معیار'],
      ]),
      nps(),
      improve(),
      contact(['name', 'company', 'email']),
    ],
  },
  {
    key: 'pharmacy', icon: '💊', name: 'Pharmacy & medical store',
    description: 'Medicine availability, the pharmacist\'s advice, genuine products, prices, delivery and waiting time.',
    content: content(
      'Thank you for visiting {business}. Tell us how we did — it takes less than a minute.',
      '{business} تشریف لانے کا شکریہ۔ ہمیں بتائیں کہ ہم نے کیسا کیا — اس میں ایک منٹ سے کم وقت لگتا ہے۔',
    ),
    questions: [
      choice('visit_type', 'How did you get your medicines today?', 'آج آپ نے دوائیں کیسے حاصل کیں؟', [
        ['in_store', 'In the store', 'اسٹور سے'],
        ['delivery', 'Home delivery', 'ہوم ڈیلیوری'],
        ['whatsapp_order', 'Ordered on WhatsApp', 'واٹس ایپ پر آرڈر'],
      ], { required: true }),
      csat('Overall, how satisfied are you with {business} today?', 'آج آپ مجموعی طور پر {business} سے کتنے مطمئن ہیں؟'),
      yesno('all_found', 'Did you get every medicine you needed?', 'کیا آپ کو اپنی تمام مطلوبہ دوائیں مل گئیں؟'),
      grid([
        ['advice', 'The pharmacist\'s advice', 'فارماسسٹ کا مشورہ'],
        ['genuine', 'Confidence the medicines are genuine', 'دواؤں کے اصل ہونے کا اعتماد'],
        ['speed', 'Waiting time', 'انتظار کا وقت'],
        ['price', 'Prices and discounts', 'قیمتیں اور رعایت'],
        CLEAN,
      ]),
      nps(),
      improve(),
      loved(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'insurance', icon: '🛡️', name: 'Insurance & takaful',
    description: 'Buying, renewing and claiming: clear terms, speed of settlement, agent support and trust.',
    content: content(
      'Thank you for trusting {business}. Tell us about your recent experience — it takes two minutes.',
      '{business} پر اعتماد کرنے کا شکریہ۔ اپنے حالیہ تجربے کے بارے میں بتائیں — اس میں دو منٹ لگتے ہیں۔',
    ),
    questions: [
      choice('reason', 'What was your recent contact with us about?', 'ہم سے آپ کا حالیہ رابطہ کس بارے میں تھا؟', [
        ['new_policy', 'Buying a policy', 'نئی پالیسی خریدنا'],
        ['renewal', 'Renewal', 'تجدید'],
        ['claim', 'A claim', 'کلیم'],
        ['query', 'A question or a change', 'سوال یا تبدیلی'],
      ], { required: true }),
      csat('Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'),
      yesno('resolved', 'Did we sort out what you needed?', 'کیا آپ کا کام ہو گیا؟', { metric: 'resolved' }),
      grid([
        ['clarity', 'Clear explanation of cover and terms', 'کوریج اور شرائط کی واضح وضاحت'],
        ['agent', 'Your agent or advisor', 'آپ کا ایجنٹ یا مشیر'],
        ['speed', 'Speed of service', 'سروس کی رفتار'],
        ['claim', 'Fair handling of claims', 'کلیم کے معاملے میں انصاف'],
        ['docs', 'Paperwork and documents', 'کاغذی کارروائی اور دستاویزات'],
      ]),
      ces('How easy was it to deal with us?', 'ہمارے ساتھ معاملہ کرنا کتنا آسان تھا؟'),
      nps(),
      improve(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'software_it', icon: '💻', name: 'Software, IT & SaaS',
    description: 'Customers of software and IT services: value, reliability, ease of use, support and whether they will renew.',
    content: content(
      'Thank you for using {business}. A few quick questions help us build what you need — about two minutes.',
      '{business} استعمال کرنے کا شکریہ۔ چند مختصر سوالات ہمیں آپ کی ضرورت کے مطابق بہتر بنانے میں مدد دیتے ہیں — تقریباً دو منٹ۔',
    ),
    questions: [
      csat('Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'),
      grid([
        ['value', 'Value it brings to your work', 'آپ کے کام کے لیے اس کی افادیت'],
        ['reliability', 'Reliability and uptime', 'قابلِ اعتماد اور بلا تعطل سروس'],
        ['ease', 'Ease of use', 'استعمال میں آسانی'],
        ['support', 'The support team', 'سپورٹ ٹیم'],
        ['onboarding', 'Onboarding and training', 'آغاز اور تربیت'],
      ]),
      ces('How easy is it to get things done with {business}?', '{business} کے ساتھ کام کرنا کتنا آسان ہے؟'),
      choice('renew', 'How likely are you to continue with us next year?', 'اگلے سال ہمارے ساتھ جاری رہنے کا کتنا امکان ہے؟', [
        ['definitely', 'Definitely', 'یقیناً'],
        ['probably', 'Probably', 'غالباً'],
        ['unsure', 'Not sure yet', 'ابھی یقین نہیں'],
        ['unlikely', 'Unlikely', 'امکان کم ہے'],
      ]),
      nps(),
      openText('feature', 'What one feature or change would help you most?', 'کون سی ایک خصوصیت یا تبدیلی آپ کے لیے سب سے زیادہ مددگار ہوگی؟'),
      contact(['name', 'company', 'email', 'phone']),
    ],
  },
  {
    key: 'events', icon: '🎤', name: 'Events & conferences',
    description: 'Guests after an event, wedding, exhibition or conference: organisation, venue, food, programme and value.',
    content: content(
      'Thank you for joining us at {business}. Tell us how the event went for you — it takes a minute.',
      '{business} کی تقریب میں شرکت کا شکریہ۔ ہمیں بتائیں کہ تقریب آپ کو کیسی لگی — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      csat('Overall, how satisfied were you with the event?', 'مجموعی طور پر آپ تقریب سے کتنے مطمئن تھے؟'),
      grid([
        ['organisation', 'Organisation and timing', 'انتظام اور وقت کی پابندی'],
        ['venue', 'Venue and seating', 'مقام اور نشستیں'],
        ['food', 'Food and refreshments', 'کھانا اور ریفریشمنٹ'],
        ['programme', 'Speakers or programme', 'مقررین یا پروگرام'],
        ['sound', 'Sound and lighting', 'ساؤنڈ اور لائٹنگ'],
      ]),
      choice('heard', 'How did you hear about the event?', 'آپ کو تقریب کے بارے میں کیسے پتہ چلا؟', [
        ['social', 'Social media', 'سوشل میڈیا'],
        ['whatsapp', 'WhatsApp', 'واٹس ایپ'],
        ['friend', 'A friend or colleague', 'دوست یا ساتھی'],
        ['invite', 'An invitation', 'دعوت نامہ'],
      ], { allow_other: true }),
      yesno('again', 'Would you come to our next event?', 'کیا آپ ہماری اگلی تقریب میں آئیں گے؟'),
      nps(),
      improve(),
      loved(),
      age(),
      gender(),
      city(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'home_services', icon: '🔧', name: 'Home services & repairs',
    description: 'AC and appliance repair, plumbing, electrical, cleaning and pest control: on time, fixed first time, courtesy and price.',
    content: content(
      'Thank you for choosing {business}. Tell us how our visit went — it takes less than a minute.',
      '{business} کا انتخاب کرنے کا شکریہ۔ ہمیں بتائیں کہ ہماری سروس کیسی رہی — اس میں ایک منٹ سے کم وقت لگتا ہے۔',
    ),
    questions: [
      choice('service', 'Which service did we provide?', 'ہم نے کون سی سروس فراہم کی؟', [
        ['ac', 'AC or appliance repair', 'اے سی یا گھریلو آلات کی مرمت'],
        ['plumbing', 'Plumbing', 'پلمبنگ'],
        ['electrical', 'Electrical work', 'بجلی کا کام'],
        ['cleaning', 'Cleaning', 'صفائی'],
        ['pest', 'Pest control', 'کیڑے مار سروس'],
      ], { required: true, allow_other: true }),
      csat('Overall, how satisfied are you with the service?', 'مجموعی طور پر آپ سروس سے کتنے مطمئن ہیں؟'),
      yesno('fixed', 'Was the job done right the first time?', 'کیا کام پہلی ہی بار میں ٹھیک ہو گیا؟', { metric: 'resolved' }),
      grid([
        ['on_time', 'Arrived on time', 'وقت پر پہنچے'],
        ['skill', 'Skill of the technician', 'ٹیکنیشن کی مہارت'],
        ['courtesy', 'Courtesy and respect for your home', 'اخلاق اور آپ کے گھر کا احترام'],
        ['tidy', 'Left the place clean', 'جگہ صاف چھوڑی'],
        ['price', 'A fair and clear price', 'مناسب اور واضح قیمت'],
      ]),
      nps(),
      improve(),
      city(),
      contact(),
    ],
  },
  {
    key: 'public_services', icon: '🏛️', name: 'Government & public services',
    description: 'Citizens after an office visit, helpline call or online service: was the work done, waiting time, courtesy and clarity.',
    content: content(
      'Thank you for visiting {business}. Your feedback helps us serve citizens better — it takes a minute.',
      '{business} تشریف لانے کا شکریہ۔ آپ کی رائے ہمیں شہریوں کی بہتر خدمت میں مدد دیتی ہے — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('channel_used', 'How did you contact us?', 'آپ نے ہم سے کیسے رابطہ کیا؟', [
        ['office', 'In person at an office', 'دفتر میں خود آ کر'],
        ['helpline', 'Helpline', 'ہیلپ لائن'],
        ['online', 'Website or app', 'ویب سائٹ یا ایپ'],
      ], { required: true }),
      yesno('resolved', 'Was your work completed?', 'کیا آپ کا کام مکمل ہو گیا؟', { metric: 'resolved' }),
      csat('Overall, how satisfied are you with the service you received?', 'مجموعی طور پر آپ کو ملنے والی سروس سے آپ کتنے مطمئن ہیں؟'),
      grid([
        ['wait', 'Waiting time', 'انتظار کا وقت'],
        ['courtesy', 'Courtesy of staff', 'عملے کا رویہ'],
        ['clarity', 'Clear information on what was needed', 'ضروری کاغذات اور طریقہ کار کی واضح معلومات'],
        ['fairness', 'Fair treatment', 'منصفانہ سلوک'],
        CLEAN,
      ]),
      ces('How easy was it to get your work done?', 'اپنا کام کروانا کتنا آسان تھا؟'),
      openText('improve', 'What one thing should we improve first?', 'ہمیں سب سے پہلے کون سی ایک چیز بہتر کرنی چاہیے؟'),
      age(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'nonprofit', icon: '🤝', name: 'NGO & non-profit',
    description: 'Beneficiaries, donors and volunteers: respect, help on time, transparency and the difference your work makes.',
    content: content(
      'Thank you for being part of {business}. Your honest feedback helps us serve better — it takes a minute.',
      '{business} کا حصہ بننے کا شکریہ۔ آپ کی دیانت دارانہ رائے ہمیں بہتر خدمت میں مدد دیتی ہے — اس میں ایک منٹ لگتا ہے۔',
    ),
    questions: [
      choice('role', 'How are you connected with us?', 'آپ ہم سے کس طرح وابستہ ہیں؟', [
        ['beneficiary', 'I received support', 'میں نے مدد حاصل کی'],
        ['donor', 'Donor', 'عطیہ دہندہ'],
        ['volunteer', 'Volunteer', 'رضاکار'],
        ['partner', 'Partner organisation', 'شراکت دار ادارہ'],
      ], { required: true }),
      csat('Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'),
      grid([
        ['respect', 'Being treated with respect', 'عزت و احترام'],
        ['timely', 'Help or updates on time', 'بروقت مدد یا معلومات'],
        ['transparency', 'Transparency about how funds are used', 'فنڈز کے استعمال میں شفافیت'],
        ['impact', 'The difference our work makes', 'ہمارے کام کا اثر'],
      ]),
      nps('How likely are you to recommend {business} to others?', 'اس بات کا کتنا امکان ہے کہ آپ دوسروں کو {business} کی سفارش کریں گے؟'),
      improve(),
      city(),
      contact(['name', 'phone', 'email']),
    ],
  },
  {
    key: 'b2b_supplier', icon: '🏭', name: 'Manufacturing & B2B supplier',
    description: 'Business customers: product quality, complete on-time deliveries, pricing, account management and after-sales support.',
    content: content(
      '{business} values your business. Tell us how we are doing as your supplier — it takes two minutes.',
      '{business} آپ کے کاروبار کی قدر کرتا ہے۔ ہمیں بتائیں کہ بطور سپلائر ہماری کارکردگی کیسی ہے — اس میں دو منٹ لگتے ہیں۔',
    ),
    questions: [
      csat('Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'),
      grid([
        ['quality', 'Product quality and consistency', 'مصنوعات کا معیار اور یکسانیت'],
        ['delivery', 'Complete, on-time deliveries', 'بروقت اور مکمل ڈیلیوری'],
        ['pricing', 'Competitive pricing', 'مسابقتی قیمتیں'],
        ['account', 'Account manager support', 'اکاؤنٹ منیجر کا تعاون'],
        ['after_sales', 'After-sales and technical support', 'بعد از فروخت اور تکنیکی مدد'],
        ['invoicing', 'Accurate invoices and documents', 'درست انوائس اور دستاویزات'],
      ]),
      ces('How easy is it to do business with us?', 'ہمارے ساتھ کاروبار کرنا کتنا آسان ہے؟'),
      choice('share', 'Roughly how much of what you buy in our category comes from us?', 'ہماری کیٹیگری میں آپ کی خریداری کا تقریباً کتنا حصہ ہم سے آتا ہے؟', [
        ['most', 'Most of it', 'زیادہ تر'],
        ['half', 'About half', 'تقریباً آدھا'],
        ['some', 'Some of it', 'کچھ حصہ'],
        ['little', 'Very little', 'بہت کم'],
      ]),
      nps('How likely are you to recommend {business} to another business?', 'اس بات کا کتنا امکان ہے کہ آپ {business} کی سفارش کسی دوسرے کاروبار سے کریں گے؟'),
      improve(),
      contact(['name', 'company', 'phone', 'email']),
    ],
  },
  {
    key: 'website_app', icon: '📱', name: 'Website & app experience',
    description: 'Visitors to your website or app: did they find what they came for, how easy it was, speed and trust.',
    content: content(
      'Help us improve {business} online — a few quick questions.',
      '{business} کو آن لائن بہتر بنانے میں ہماری مدد کریں — چند مختصر سوالات۔',
      { skip_intro: true },
    ),
    questions: [
      choice('purpose', 'What did you come to do today?', 'آج آپ کس مقصد سے آئے؟', [
        ['buy', 'Buy something', 'کچھ خریدنے'],
        ['info', 'Find information', 'معلومات حاصل کرنے'],
        ['account', 'Manage my account or order', 'اپنا اکاؤنٹ یا آرڈر دیکھنے'],
        ['support', 'Get help', 'مدد لینے'],
      ], { required: true, allow_other: true }),
      yesno('found', 'Did you find what you came for?', 'کیا آپ کو وہ مل گیا جس کے لیے آپ آئے تھے؟', { metric: 'resolved', required: true }),
      ces('How easy was it to use?', 'اسے استعمال کرنا کتنا آسان تھا؟'),
      grid([
        ['speed', 'Page speed', 'صفحات کی رفتار'],
        ['design', 'Look and layout', 'ڈیزائن اور ترتیب'],
        ['trust', 'Trust and security', 'اعتماد اور تحفظ'],
      ]),
      csat('Overall, how satisfied are you with our website or app?', 'مجموعی طور پر آپ ہماری ویب سائٹ یا ایپ سے کتنے مطمئن ہیں؟'),
      openText('better', 'What would make it better?', 'اسے کیا چیز بہتر بنا سکتی ہے؟'),
    ],
  },
  {
    key: 'support_chat', icon: '💬', name: 'After a WhatsApp or chat conversation',
    description: 'Three taps, sent the moment a conversation ends: satisfaction, resolved, and one comment.',
    content: content(
      'A quick question about your conversation with {business}.',
      '{business} کے ساتھ آپ کی بات چیت کے بارے میں ایک مختصر سوال۔',
      { skip_intro: true },
    ),
    questions: [
      csat('How was your conversation with {business} today?', 'آج {business} کے ساتھ آپ کی بات چیت کیسی رہی؟'),
      yesno('resolved', 'Did we sort out what you needed?', 'کیا آپ کا کام ہو گیا؟', { metric: 'resolved', required: true }),
      {
        id: 'comment', type: 'text', required: false, multiline: true,
        title: L('Anything we could have done better?', 'کیا ہم کچھ بہتر کر سکتے تھے؟'),
      },
    ],
  },
  {
    key: 'general', icon: '⭐', name: 'General satisfaction',
    description: 'Works for any business: satisfaction, likelihood to recommend, what to improve and what to keep.',
    content: content(
      'Thank you for choosing {business}. Tell us how we did — it takes less than a minute.',
      '{business} کا انتخاب کرنے کا شکریہ۔ ہمیں بتائیں کہ ہم نے کیسا کام کیا — اس میں ایک منٹ سے بھی کم وقت لگتا ہے۔',
    ),
    questions: [
      csat('Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'),
      nps(),
      improve(),
      loved(),
      age(),
      gender(),
      city(),
      contact(),
    ],
  },
  {
    key: 'blank', icon: '✏️', name: 'Start from scratch',
    description: 'One satisfaction question to start from — add, reorder and word the rest yourself.',
    content: content(
      'Thank you for choosing {business}. Tell us how we did.',
      '{business} کا انتخاب کرنے کا شکریہ۔ ہمیں بتائیں کہ ہم نے کیسا کام کیا۔',
    ),
    questions: [
      csat('Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'),
    ],
  },
];

const BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

/** A template by key, as a deep copy the caller may change freely. */
function templateByKey(key) {
  const t = BY_KEY.get(String(key || ''));
  return t ? JSON.parse(JSON.stringify(t)) : null;
}

/**
 * The library's shelves. Every template sits on one, so a business finds its
 * own industry at a glance rather than reading twenty-eight cards.
 */
const CATEGORIES = [
  { key: 'food', label: 'Food, hotels & travel', icon: '🍽️', templates: ['restaurant', 'hotel', 'travel', 'events'] },
  { key: 'shops', label: 'Shops & products', icon: '🛍️', templates: ['retail', 'ecommerce', 'pharmacy', 'fmcg_consumer', 'fmcg_trade'] },
  { key: 'health', label: 'Health & wellbeing', icon: '🩺', templates: ['healthcare', 'salon_fitness'] },
  { key: 'money', label: 'Finance, property & cars', icon: '🏦', templates: ['banking', 'insurance', 'real_estate', 'automotive'] },
  { key: 'services', label: 'Services & B2B', icon: '💼', templates: ['professional', 'software_it', 'home_services', 'telecom', 'logistics', 'b2b_supplier'] },
  { key: 'public', label: 'Education, public & non-profit', icon: '🎓', templates: ['education', 'public_services', 'nonprofit'] },
  { key: 'digital', label: 'Chats, websites & apps', icon: '💬', templates: ['support_chat', 'website_app'] },
  { key: 'any', label: 'Any business', icon: '⭐', templates: ['general', 'blank'] },
];
const CATEGORY_OF = new Map(CATEGORIES.flatMap((c) => c.templates.map((k) => [k, c])));
// What most businesses here start with — shown first before anyone filters.
const POPULAR = ['restaurant', 'retail', 'healthcare', 'support_chat', 'ecommerce', 'general'];
// A business's industry is one of the templates — all but these three, which
// describe a moment (a chat, a website) or nothing at all, not a business.
const NOT_AN_INDUSTRY = ['support_chat', 'website_app', 'blank'];
// Where a template's name reads oddly as an answer to "your industry".
const INDUSTRY_LABEL = {
  fmcg_consumer: 'FMCG — consumer products', fmcg_trade: 'FMCG — trade & distribution', general: 'Other / any business',
};
// What people type when they look for their business, beyond the names.
const KEYWORDS = {
  restaurant: 'food cafe dhaba bakery fast food takeaway dine-in dining eatery sweets',
  fmcg_consumer: 'product consumer brand packaging taste quality fmcg',
  fmcg_trade: 'distributor dealer retailer shopkeeper trade wholesale fmcg',
  telecom: 'internet isp mobile network broadband fibre telco',
  healthcare: 'hospital clinic doctor patient lab laboratory diagnostic medical dental',
  retail: 'shop store outlet mall showroom clothing garments supermarket mart',
  ecommerce: 'online delivery order website shopping cash on delivery',
  hotel: 'guest house resort stay room booking motel',
  banking: 'bank branch account loan finance microfinance atm',
  education: 'school college university academy tuition training students parents',
  real_estate: 'property plot housing society builder developer rent',
  automotive: 'car workshop service dealership motor bike showroom',
  logistics: 'courier cargo shipping delivery parcel freight',
  salon_fitness: 'salon spa gym fitness beauty parlour barber',
  travel: 'tour umrah hajj tickets airline agency holiday',
  professional: 'consultant lawyer accountant agency firm legal audit tax',
  pharmacy: 'chemist medicine medical store drug',
  insurance: 'takaful policy claim',
  software_it: 'software saas it app tech support',
  events: 'event conference seminar wedding exhibition expo',
  home_services: 'plumber electrician repair cleaning ac maintenance pest',
  public_services: 'government public office municipal citizen service',
  nonprofit: 'ngo charity donor volunteer welfare trust foundation',
  b2b_supplier: 'manufacturing factory supplier b2b industrial vendor',
  website_app: 'website app online digital ux',
  support_chat: 'whatsapp chat support conversation agent bot',
  general: 'any business general satisfaction',
};
// What else suits a business in each industry, best first: shown beside its
// own template under "Recommended". Every client has a WhatsApp agent, so the
// after-chat survey is rarely far away.
const RELATED = {
  restaurant: ['support_chat', 'ecommerce', 'events'],
  fmcg_consumer: ['fmcg_trade', 'ecommerce', 'support_chat'],
  fmcg_trade: ['fmcg_consumer', 'b2b_supplier', 'logistics'],
  telecom: ['support_chat', 'website_app', 'retail'],
  healthcare: ['pharmacy', 'support_chat', 'general'],
  retail: ['ecommerce', 'support_chat', 'fmcg_consumer'],
  ecommerce: ['logistics', 'website_app', 'support_chat'],
  hotel: ['restaurant', 'travel', 'events'],
  banking: ['insurance', 'support_chat', 'website_app'],
  education: ['events', 'support_chat', 'website_app'],
  real_estate: ['professional', 'support_chat', 'general'],
  automotive: ['insurance', 'support_chat', 'home_services'],
  logistics: ['ecommerce', 'b2b_supplier', 'support_chat'],
  salon_fitness: ['support_chat', 'retail', 'general'],
  travel: ['hotel', 'support_chat', 'events'],
  professional: ['support_chat', 'software_it', 'general'],
  pharmacy: ['healthcare', 'ecommerce', 'support_chat'],
  insurance: ['banking', 'support_chat', 'website_app'],
  software_it: ['website_app', 'support_chat', 'professional'],
  events: ['hotel', 'restaurant', 'support_chat'],
  home_services: ['support_chat', 'professional', 'general'],
  public_services: ['support_chat', 'website_app', 'general'],
  nonprofit: ['events', 'support_chat', 'general'],
  b2b_supplier: ['fmcg_trade', 'logistics', 'professional'],
  general: ['support_chat', 'website_app', 'blank'],
};
const RANGE = { csat: [1, 5], rating: [1, 5], nps: [0, 10], ces: [1, 7] };
/** When a follow-on question is asked, in words: "if they score 0–8". */
function whenAsked(q, questions) {
  const c = q.show_if;
  if (!c) return '';
  const src = questions.find((x) => x.id === c.q);
  if (!src) return '';
  const range = RANGE[src.type];
  if (range && (c.op === 'lte' || c.op === 'lt')) return `if they score ${range[0]}–${c.op === 'lt' ? c.v - 1 : c.v} out of ${range[1]}`;
  if (range && (c.op === 'gte' || c.op === 'gt')) return `if they score ${c.op === 'gt' ? c.v + 1 : c.v}–${range[1]} out of ${range[1]}`;
  if (src.type === 'yesno') return `if they answer "${c.v ? 'yes' : 'no'}"`;
  const opt = (src.options || []).find((o) => o.id === c.v);
  if (opt) return `if they choose "${opt.label.en}"`;
  return 'depending on an earlier answer';
}
const SECONDS = { csat: 5, nps: 6, ces: 5, rating: 5, yesno: 4, single: 6, multi: 9, text: 25, contact: 20 };
const minutesFor = (qs) => Math.max(1, Math.round(qs.reduce((t, q) => t + (SECONDS[q.type] || (q.type === 'rating_grid' ? 4 * (q.rows || []).length : 6)), 0) / 60));

/** The gallery: enough to choose from, without shipping every question. */
function templateSummaries() {
  return TEMPLATES.map((t) => {
    const cat = CATEGORY_OF.get(t.key) || CATEGORIES[CATEGORIES.length - 1];
    return {
      key: t.key,
      icon: t.icon,
      name: t.name,
      description: t.description,
      setup_hint: t.setup_hint || '',
      category: cat.key,
      category_label: cat.label,
      category_icon: cat.icon,
      popular: POPULAR.includes(t.key),
      is_industry: !NOT_AN_INDUSTRY.includes(t.key),
      industry_label: INDUSTRY_LABEL[t.key] || t.name,
      related: (RELATED[t.key] || []).filter((k) => BY_KEY.has(k)),
      minutes: minutesFor(t.questions),
      question_count: t.questions.length,
      measures: [...new Set(t.questions.map((q) => (
        q.type === 'csat' ? 'CSAT' : q.type === 'nps' ? 'NPS' : q.type === 'ces' ? 'Effort'
          : q.metric === 'resolved' ? 'Resolution' : q.profile ? 'Who answered' : null
      )).filter(Boolean))],
      languages: ['English', 'اردو'],
      keywords: KEYWORDS[t.key] || '',
      preview: t.questions.map((q) => q.title.en),
      // Every question, for the library's preview: what it asks, how, and when.
      outline: t.questions.map((q) => ({ title: q.title.en, type: q.type, about_you: !!q.profile, when: whenAsked(q, t.questions) })),
    };
  });
}

/** Whether a key names a business's industry (a template other than a chat, a website or a blank page). */
const isIndustry = (key) => BY_KEY.has(String(key || '')) && !NOT_AN_INDUSTRY.includes(String(key));

/** The shelves, with how many templates each holds. */
function templateCategories() {
  return CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon, count: c.templates.filter((k) => BY_KEY.has(k)).length }));
}

module.exports = {
  ABOUT_YOU: { gender, city, age }, TEMPLATES, CATEGORIES, templateByKey, templateSummaries, templateCategories, isIndustry };
