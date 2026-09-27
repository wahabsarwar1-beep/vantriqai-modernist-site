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

/** The gallery: enough to choose from, without shipping every question. */
function templateSummaries() {
  return TEMPLATES.map((t) => ({
    key: t.key,
    icon: t.icon,
    name: t.name,
    description: t.description,
    setup_hint: t.setup_hint || '',
    question_count: t.questions.length,
    measures: [...new Set(t.questions.map((q) => (
      q.type === 'csat' ? 'CSAT' : q.type === 'nps' ? 'NPS' : q.type === 'ces' ? 'Effort'
        : q.metric === 'resolved' ? 'Resolution' : null
    )).filter(Boolean))],
    preview: t.questions.map((q) => q.title.en),
  }));
}

module.exports = { TEMPLATES, templateByKey, templateSummaries };
