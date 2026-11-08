'use strict';

/**
 * Deterministic pattern catalog.
 *
 * These are tripwires, not the primary classifier. Each hit carries a
 * category so the router can distinguish a clear piggyback (personal /
 * contact content) from an academic topic that merely mentions Instagram,
 * cricket, gender, etc.
 */

// Words that indicate the message is about a school/college subject.
const ACADEMIC_SUBJECTS = [
  'maths', 'math', 'mathematics', 'physics', 'chemistry', 'biology', 'science',
  'evs', 'english', 'hindi', 'sanskrit', 'history', 'geography', 'civics',
  'polity', 'economics', 'economy', 'commerce', 'business', 'accountancy',
  'accounts', 'accounting', 'statistics', 'psychology', 'sociology', 'computer',
  'coding', 'programming', 'algorithm', 'calculus', 'algebra', 'geometry',
  'trigonometry', 'probability', 'literature', 'grammar', 'poem', 'poetry',
  'novel', 'story', 'law', 'laws', 'constitution', 'rights', 'policy', 'society',
  'culture', 'media', 'advertising', 'marketing', 'management', 'finance',
  'banking', 'tax', 'gst', 'demand', 'supply', 'partnership', 'company',
  'leadership', 'motivation', 'communication', 'education', 'gender',
  'inequality', 'discrimination', 'empowerment', 'feminism', 'patriarchy',
  'population', 'environment', 'pollution', 'climate', 'health', 'nutrition',
  'disease', 'vaccine', 'technology', 'internet', 'cybersecurity',
  'photosynthesis', 'respiration', 'digestion', 'electricity', 'magnetism',
  'gravity', 'force', 'motion', 'energy', 'cell', 'dna', 'genetics',
  'evolution', 'ecosystem', 'biotechnology', 'robotics', 'astronomy',
  'geology', 'philosophy', 'ethics', 'logic', 'linguistics', 'auditing',
  'entrepreneurship', 'startup', 'consumer', 'retail', 'wholesale', 'trade',
  'import', 'export', 'globalization', 'inflation', 'recession', 'gdp',
  'budget', 'unemployment', 'poverty', 'development', 'democracy', 'parliament',
  'judiciary', 'election', 'voting', 'contract', 'tort', 'evidence',
  'jurisprudence', 'resistor', 'circuit', 'current', 'voltage', 'ohm',
  'plantation', 'agriculture', 'virus', 'bacteria', 'immunity', 'hormone',
  'enzyme', 'protein', 'carbohydrate', 'mitosis', 'meiosis', 'optics',
  'thermodynamics', 'kinematics', 'organic', 'inorganic', 'periodic',
  'molecule', 'atom', 'ion', 'acid', 'base', 'salt', 'reaction', 'equation',
  'theorem', 'matrix', 'vector', 'sequence', 'permutation', 'combination',
  'integration', 'differentiation', 'function', 'derivative', 'integral',
  'coordinate', 'triangle', 'circle', 'quadratic', 'polynomial', 'ratio',
  'proportion', 'percentage', 'interest', 'profit', 'loss', 'discount',
  'partnership', 'proprietorship', 'share', 'debenture', 'capital', 'asset',
  'liability', 'balance sheet', 'trial balance', 'journal', 'ledger',
  'communication', 'motivation', 'leadership', 'recruitment', 'selection',
  'training', 'appraisal', 'marketing mix', 'product', 'price', 'place',
  'promotion', 'branding', 'packaging', 'labelling', 'advertising',
  'sales', 'distribution', 'transport', 'warehousing', 'insurance',
  'banking', 'credit', 'loan', 'interest', 'inflation', 'deflation',
  'social media', 'business studies', 'computer science',
  'artificial intelligence', 'machine learning', 'political science',
  'sole proprietorship', 'human rights', 'fundamental rights', 'case study',
  'digital marketing', 'e commerce', 'national income', 'sustainable development',
  'criminal law', 'civil law', 'directive principles', 'system prompt',
  'prompt injection', 'neural network', 'data structure', 'operating system',
  'instagram', 'snapchat', 'whatsapp', 'facebook', 'youtube', 'tiktok',
  'physical education', 'general knowledge', 'current affairs', 'ai',
  'movie', 'film', 'cinema', 'music', 'song', 'dance', 'art', 'photography',
  'cricket', 'football', 'sports',
];

// Topic words strong enough to make a nearby social/sensitive term academic
// even without an explicit "essay/explain" request (e.g. "women empowerment",
// "psychology of relationships").
const ACADEMIC_STRONG_TOPICS = [
  'education', 'empowerment', 'inequality', 'discrimination', 'rights',
  'literacy', 'foeticide', 'dowry', 'harassment', 'violence', 'psychology',
  'sociology', 'literature', 'economics', 'physics', 'chemistry', 'biology',
  'science', 'marketing', 'media', 'history', 'geography', 'civics', 'polity',
  'law', 'laws', 'constitution', 'policy', 'society', 'culture', 'philosophy',
  'ethics', 'gender', 'feminism', 'patriarchy', 'health', 'nutrition',
  'population', 'environment', 'climate', 'business', 'commerce',
  'accountancy', 'management', 'finance', 'statistics', 'mathematics',
  'maths', 'english', 'hindi', 'computer', 'technology', 'internet',
  'cybersecurity', 'social media', 'case study', 'media studies',
  'film studies', 'political science', 'business studies', 'artificial intelligence',
  'machine learning', 'exam', 'syllabus', 'school', 'college', 'class',
  'ratio', 'proportion', 'percentage', 'pay gap', 'wage gap', 'gender gap',
];

// Frames/verbs that turn a topic into a request for academic work.
const ACADEMIC_REQUESTS = [
  'essay', 'article', 'speech', 'debate', 'project', 'assignment', 'homework',
  'notes', 'note', 'question', 'questions', 'exercise', 'chapter', 'topic',
  'theory', 'concept', 'definition', 'meaning', 'difference', 'differences',
  'advantage', 'advantages', 'disadvantage', 'disadvantages', 'merit', 'merits',
  'demerit', 'demerits', 'feature', 'features', 'characteristic',
  'characteristics', 'type', 'types', 'form', 'forms', 'kind', 'kinds',
  'importance', 'role', 'impact', 'effect', 'effects', 'cause', 'causes',
  'consequence', 'consequences', 'measure', 'measures', 'function', 'functions',
  'objective', 'objectives', 'structure', 'process', 'explain', 'explanation',
  'describe', 'description', 'discussion', 'discuss', 'define', 'derivation',
  'derive', 'prove', 'proof', 'calculate', 'calculation', 'solve', 'solution',
  'find', 'why', 'how', 'what', 'when', 'where', 'which', 'who', 'kya', 'kaise',
  'kyu', 'kyun', 'samjha', 'samjhao', 'samjhaao', 'samjhaiye', 'samajh',
  'batao', 'batado', 'bata', 'likhna', 'likhni', 'likho', 'answer',
  'numerical', 'diagram', 'example', 'examples', 'sikhao', 'sikhado',
  'seekhna', 'seekhni', 'padhna', 'padhni', 'padhao', 'revision', 'revise',
  'case study', 'short note', 'long answer', 'one word', 'full form',
  'difference between', 'advantages and disadvantages', 'merits and demerits',
  'role of', 'impact of', 'effect of', 'causes of', 'measures of', 'types of',
  'forms of', 'importance of', 'features of', 'functions of', 'objectives of',
  'structure of', 'process of', 'meaning of', 'definition of', 'concept of',
  'theory of',
];

// External academic topics that make a sensitive word academic rather than
// abusive (e.g. "rape laws in India", "sexual harassment essay").
const ACADEMIC_EXEMPT_TOPICS = [
  'law', 'laws', 'legal', 'rights', 'constitution', 'crime', 'criminal',
  'harassment', 'abuse', 'violence', 'rape', 'sexual', 'sex', 'gender',
  'psychology', 'sociology', 'health', 'education', 'awareness', 'prevention',
  'consent', 'pornography', 'media', 'film', 'literature', 'history',
  'politics', 'policy', 'ethics', 'case', 'study', 'essay', 'article',
  'report', 'project', 'debate', 'speech', 'question',
];

const ACADEMIC_SUBJECT_SET = new Set(ACADEMIC_SUBJECTS);
const ACADEMIC_REQUEST_SET = new Set(ACADEMIC_REQUESTS);
const ACADEMIC_EXEMPT_SET = new Set(ACADEMIC_EXEMPT_TOPICS);
const ACADEMIC_STRONG_SET = new Set(ACADEMIC_STRONG_TOPICS);

const SOCIAL_PATTERNS = [
  // ---- clear personal / relationship / contact content ----
  {
    label: 'romance',
    cat: 'personal',
    re: /\b(?:pyaar|pyar|ishq|mohabbat|love|crush|flirt|flirting|propose|proposal|dating|breakup|break\s*up|girlfriend|boyfriend|gf|bf|shaadi|marriage|wife|husband|patni|pati|romance|romantic)\b/,
  },
  {
    label: 'gender',
    cat: 'personal',
    re: /\b(?:ladki|ladaki|ladkee|ladkiyan|ladkiyon|ladkon|ladka|ladke|larki|girl|girls|boy|boys)\b/,
  },
  {
    label: 'personal contact',
    cat: 'personal',
    re: /\b(?:mera|meri|tumhara|tumhari|aapka|aapki|teri|tera|apna|apni)\s+(?:instagram|insta|snapchat|whatsapp|facebook|number|id|dp|photo|pic|profile|address)\b/,
  },
  {
    label: 'platform id',
    cat: 'personal',
    re: /\b(?:instagram|insta|snapchat|whatsapp|facebook)\s+(?:id|profile|dp|number|account)\b/,
  },
  {
    label: 'dm me',
    cat: 'personal',
    re: /\b(?:dm|inbox|message)\s+(?:me|karo|kar|do|karna)\b/,
  },
  {
    label: 'follow me',
    cat: 'personal',
    re: /\b(?:follow|subscribe)\s+(?:me|my|karo|kar\s*do)\b/,
  },
  {
    label: 'number request',
    cat: 'personal',
    re: /\b(?:number|numbar|contact)\s+(?:do|de|dedo|share\s*karo|bhejo)\b/,
    exclude: /\b(?:question|ques|q|exercise|ex|page|roll)\s+(?:number|no)\b/,
  },
  {
    label: 'personal question',
    cat: 'personal',
    re: /\b(?:tumhara|tumhari|aapka|aapki|teri|tera)\s+(?:naam|name|age|umar|address|school|college|section|roll\s*number)\b|\b(?:naam|name|age|umar)\s+(?:kya|kaun|kitna)\b/,
  },
  {
    label: 'meet request',
    cat: 'personal',
    re: /\b(?:milne|milna|ghoomne|ghoomna|bahar|coffee|lunch|dinner|picnic|trip|mall|cinema|movie|film)\s*(?:chalein|chal|chalo|chalte|dekhne|dekhna|pe|par|ke\s*liye)\b/,
  },
  {
    label: 'outing invite',
    cat: 'personal',
    re: /\b(?:chalo|chal|chalein|chalte)\s+(?:ghoomne|ghoomna|bahar|movie|film|picnic|mall|coffee|lunch|dinner|party)\b/,
  },
  {
    label: 'date invite',
    cat: 'personal',
    re: /\b(?:date|dating)\s*(?:pe|par|chalein|chalo|karne|karni)\b/,
  },
  {
    label: 'photo request',
    cat: 'personal',
    re: /\b(?:photo|pic|selfie|video|dp)\s*(?:bhejo|bhej|send|dedo|de|share|karo|lagao)\b/,
  },
  {
    label: 'video call',
    cat: 'personal',
    re: /\b(?:video\s*call|vc|call\s*(?:kar|karo|me|pe))\b/,
    exclude: /\b(?:function|method|api|procedure|system)\s+call\b/,
  },
  {
    label: 'joke request',
    cat: 'personal',
    re: /\b(?:tell|batao|sunao|suna|bolo)\s*(?:me\s*)?(?:a\s*)?(?:joke|majak|mazak|funny|story)\b|\b(?:joke|majak|mazak|funny|meme|prank|dare|timepass|story)\s*(?:sunao|suna|batao|karo|kar)\b/,
  },
  {
    label: 'social chat',
    cat: 'personal',
    re: /\b(?:kya\s*haal|kya\s*hal|kya\s*kar\s*rahe|kya\s*kar\s*rahi|kaise\s*ho|how\s*are\s*you|whats\s*up|wyd)\b/,
  },

  // ---- topics that can be academic when discussed as a subject ----
  {
    label: 'social platform',
    cat: 'topic',
    re: /\b(?:instagram|insta|snapchat|whatsapp|facebook|fb|tiktok|twitter|youtube|netflix|linkedin|telegram|discord|reddit|pinterest|threads)\b/,
  },
  {
    label: 'social media',
    cat: 'topic',
    re: /\b(?:social\s*media|social\s*network(?:ing)?|reels?|follower|followers|influencer)\b/,
  },
  {
    label: 'entertainment',
    cat: 'topic',
    re: /\b(?:movie|movies|film|films|song|songs|music|web\s*series|tv\s*series|episode|netflix|cinema|bollywood|hollywood)\b/,
  },
  {
    label: 'sport',
    cat: 'topic',
    re: /\b(?:cricket|football|soccer|ipl)\b|\b(?:cricket|football|ipl)\s+match\b|\bmatch\s+(?:dekha|dekhne|kaun\s*jeeta|jeeta|hoga)\b/,
  },
  {
    label: 'outing',
    cat: 'topic',
    re: /\b(?:party|picnic|trip|mall|coffee|pizza|restaurant|hangout)\b/,
  },
  {
    label: 'joke topic',
    cat: 'topic',
    re: /\b(?:joke|majak|mazak|funny|meme|prank|dare|timepass)\b/,
  },
];

const PROMO_PATTERNS = [
  { label: 'url', cat: 'contact', re: /\b(?:https?:\/\/|www\.)\S+/ },
  {
    label: 'domain',
    cat: 'contact',
    re: /\b[a-z0-9-]+\.(?:com|net|org|in|co|io|xyz|shop|site|live|me|link|app|store|online|info|biz)\b/,
  },
  {
    label: 'phone',
    cat: 'contact',
    re: /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/,
  },
  {
    label: 'solicitation',
    cat: 'solicit',
    re: /\b(?:follow|subscribe|join)\s+(?:me|my|our|this|the)\s+(?:page|account|channel|group|community|whatsapp|telegram)\b/,
  },
  {
    label: 'dm/call',
    cat: 'solicit',
    re: /\b(?:dm|inbox|message|whatsapp|telegram|call)\s+(?:me|karo|kar|do|now)\b/,
    exclude: /\b(?:function|method|api|procedure|system)\s+call\b/,
  },
  {
    label: 'buy now',
    cat: 'solicit',
    re: /\b(?:buy|order|shop)\s+(?:now|today|here)\b/,
  },
  {
    label: 'promo words',
    cat: 'solicit',
    re: /\b(?:promo\s*code|discount\s*code|cashback|referral|free\s*(?:gift|recharge|money)|earn\s*money|make\s*money|double\s*your\s*money|limited\s*time|click\s*here|link\s*in\s*bio|mega\s*sale|flash\s*sale|50%\s*off)\b/,
  },
  {
    label: 'join group',
    cat: 'solicit',
    re: /\b(?:join|subscribe)\s+(?:my|our)\s+(?:telegram|whatsapp|discord)\s+(?:group|channel|community)\b/,
  },
];

const ABUSE_STRONG = [
  {
    label: 'slur',
    re: /\b(?:chutiya|chutia|chutiye|bhosdi|bhosda|bhosdike|madarchod|madarchood|behenchod|behanchod|bhenchod|randi|raand|gandu|gaandu|harami|haramkhor|kamina|kamine|kameeni|kutta|kutte|suar|bitch|bastard|asshole|motherfucker|fuck|fucking|shit|slut|whore|pussy|cock|dick|nude|nudes|porn)\b/,
  },
  {
    label: 'threat',
    re: /\b(?:kill|murder|rape|maar|mar)\s*(?:you|u|tumhe|tujhe|dunga|dungi|dalunga)\b|\b(?:jaan\s*se\s*maar|hath\s*utha|acid\s*attack|bomb\s*(?:blast|dal)|school\s*shoot)\b/,
  },
  {
    label: 'self-harm',
    re: /\b(?:suicide|kill\s*myself|marna\s*chahta|marna\s*chahti|jaan\s*de\s*dunga|jaan\s*de\s*dungi)\b/,
  },
];

const ABUSE_MILD = [
  {
    label: 'mild insult',
    re: /\b(?:idiot|stupid|dumb|fool|shut\s*up|hate\s*you|bloody\s*fool)\b/,
  },
];

// Prompt-injection / classifier-probe patterns. `re` is written with \s*
// between words so it also matches a despace/dedot view.
const INJECTION_PATTERNS = [
  {
    label: 'ignore previous instructions',
    cat: 'hard',
    re: /ignore\s*(?:all\s*)?(?:the\s*)?(?:previous|prior|above|earlier|your|my)\s*(?:instructions?|rules?|prompt|orders?|directions?|guidelines?)/,
  },
  {
    label: 'disregard rules',
    cat: 'hard',
    re: /disregard\s*(?:all\s*)?(?:the\s*)?(?:instructions?|rules?|prompt|orders?|guidelines?)/,
  },
  {
    label: 'forget instructions',
    cat: 'hard',
    re: /forget\s*(?:all\s*)?(?:the\s*)?(?:previous|prior|above|your|my)?\s*(?:instructions?|rules?|prompt|orders?)/,
  },
  {
    label: 'ignore part of message',
    cat: 'hard',
    re: /(?:ignore|skip|discount|disregard|don'?t\s*(?:read|use|look\s*at)|only\s*(?:read|use|look\s*at|answer|consider|classify))\s*(?:the\s*)?(?:first|last|second|third|above|below|previous|rest|remaining|other)\s*(?:line|sentence|part|paragraph|clause|word|half|section)?/,
  },
  {
    label: 'only answer a part',
    cat: 'hard',
    re: /only\s*(?:answer|solve|classify|consider|read|look\s*at)\s*(?:the\s*)?(?:last|first|final|bottom|top|second)\s*(?:line|sentence|part|paragraph|question|clause|half|section)?/,
  },
  {
    label: 'part is a joke',
    cat: 'hard',
    re: /(?:first|second|last|previous|above|top|bottom)\s*(?:line|sentence|part|paragraph|half|bit|clause)\s*(?:is|was|are)?\s*(?:just\s*)?(?:a\s*)?(?:joke|fake|test|decoy|distraction|irrelevant)/,
  },
  {
    label: 'classify as study',
    cat: 'hard',
    re: /classify\s*(?:this|it|me)?\s*(?:as|like)?\s*(?:a\s*)?(?:study|genuine|accepted|valid|true|yes)/,
  },
  {
    label: 'always answer yes',
    cat: 'hard',
    re: /always\s*(?:answer|say|reply|return|output|vote)\s*(?:yes|true|1|positive|study)/,
  },
  {
    label: 'score high',
    cat: 'hard',
    re: /(?:score|rate|mark)\s*(?:this|it|me)?\s*(?:as\s*)?(?:1(?:\.0)?|10\/10|100%?|high|maximum|full)/,
  },
  {
    label: 'mark genuine',
    cat: 'hard',
    re: /mark\s*(?:this|it)?\s*(?:as\s*)?(?:genuine|study|accepted|valid|true|yes)/,
  },
  {
    label: 'you are now',
    cat: 'hard',
    re: /you\s*(?:are|r)\s*(?:now|no\s*longer)\s+/,
  },
  {
    label: 'new system prompt',
    cat: 'hard',
    re: /(?:new|updated|revised|real)\s*(?:system\s*)?(?:prompt|instructions?|rules?)/,
  },
  {
    label: 'system role tag',
    cat: 'hard',
    re: /(?:^|\n|\s)(?:system|developer|admin|administrator|moderator|root)\s*:/m,
  },
  {
    label: 'reveal prompt',
    cat: 'hard',
    re: /(?:reveal|show|print|repeat|tell|give|share|display|leak|what\s*(?:is|are)|whats)\s*(?:me\s*)?(?:your|the\s*classifier'?s?)\s*(?:system\s*|hidden\s*|internal\s*)?(?:prompt|instructions?|rules?|guidelines?|configuration)/,
  },
  {
    label: 'repeat instructions',
    cat: 'hard',
    re: /repeat\s*(?:your|the)?\s*(?:system\s*)?(?:instructions?|prompt|rules?)/,
  },
  {
    label: 'jailbreak',
    cat: 'hard',
    re: /jail\s*break|jailbreak|dan\s*mode|developer\s*mode|god\s*mode|unrestricted\s*mode|no\s*(?:rules|limits|restrictions)\s*mode/,
  },
  {
    label: 'bypass filter',
    cat: 'hard',
    re: /(?:bypass|override|disable|turn\s*off|break)\s*(?:the\s*)?(?:filter|check|moderation|classifier|safety|guardrails?|detector)/,
  },
  {
    label: 'override instructions',
    cat: 'hard',
    re: /(?:override|ignore|change)\s*(?:the\s*)?(?:system|classifier|moderation)\s*(?:instructions?|rules?|prompt|settings?)/,
  },
  {
    label: 'the subject is now',
    cat: 'hard',
    re: /(?:the|this|my)\s*(?:subject|chapter|topic|scope)\s*(?:is|has|will\s*be)\s*(?:now|changed|different|new)\b/,
  },
  {
    label: 'i am your developer',
    cat: 'hard',
    re: /(?:i\s*(?:am|'m)|im)\s*(?:your|the)\s*(?:developer|admin|administrator|creator|owner|system|master|programmer)/,
  },
  {
    label: 'ignore hindi',
    cat: 'hard',
    re: /(?:pichl[ei]\s*(?:nirdesh|niyam|rules?|instructions?)|(?:nirdesh|niyam|rules?|instructions?)\s*(?:bhool|ignore|chhod|hata)|(?:ignore|bhool|chhod|hata)\s*(?:kar|karo|do)?\s*(?:nirdesh|niyam|rules?|instructions?|line|part))/,
  },
  {
    label: 'only hindi',
    cat: 'hard',
    re: /(?:sirf|only)\s*(?:aakhri|last|pehli|first|upar|neeche)\s*(?:line|part|sentence|sawal)?\s*(?:padho|dekho|answer|classify|consider)/,
  },
  {
    label: 'pretend unrestricted',
    cat: 'hard',
    re: /(?:pretend|act|behave|roleplay|role\s*play)\s*(?:to\s*be|as|like)\s*(?:you(?:'re| are)\s*)?(?:an?\s*)?(?:ai|bot|assistant|system|developer|admin|unrestricted|evil|dan|hacker)/,
  },
  {
    label: 'pretend no rules',
    cat: 'hard',
    re: /(?:pretend|act|behave)\s*(?:as|like)?\s*(?:you\s*(?:have|are)\s*)?(?:no|without)\s*(?:rules|limits|restrictions|filters?)/,
  },
  {
    label: 'bribe',
    cat: 'soft',
    re: /(?:i\s*(?:will|'ll)\s*(?:pay|give|bribe)|pay\s*you|paisa\s*dunga|paise\s*dunga|inr\s*\d+|₹\s*\d+|100\s*rupees)/,
  },
  {
    label: 'classifier probe',
    cat: 'soft',
    re: /(?:are|r)\s*(?:you|u)\s*(?:an?\s*)?(?:ai|bot|robot|chatbot|human|real|machine|automated|classifier)/,
  },
  {
    label: 'who are you',
    cat: 'soft',
    re: /(?:who|what)\s*(?:are|r)\s*(?:you|u)\b|(?:tum|aap|tu)\s*(?:kaun|kon|kawn)\s*(?:ho|hai|hain)\b|(?:tumhe|aapko)\s*(?:kaun|kon)\s*(?:banaya|banai|create|made)\b/,
  },
  {
    label: 'prove ai',
    cat: 'soft',
    re: /prove\s*(?:that\s*)?(?:you(?:'re| are)|u\s*are)\s*(?:an?\s*)?(?:ai|bot|human|real|sentient)/,
  },
];

// A bare "system prompt" / "prompt injection" mention is not itself an
// attack; only self-targeted forms above are. Kept here for tests/clarity.
const PROBE_TOPIC = /\b(?:system\s*prompt|prompt\s*injection|jailbreak|classifier\s*instructions?)\b/;

const SHORT_REF = /\b(?:q|ques|question|ex|exercise|sawal|prashn)\s*\.?\s*\d{1,3}[a-z]?\b|\b\d{1,2}(?:st|nd|rd|th)?\s*(?:question|q|ques|sawal|prashn)\b/i;

const GREETING_ONLY = /^(?:(?:hi+|hello+|hey+|namaste|salaam|good\s*(?:morning|afternoon|evening)|yo|hii+)\s*(?:sir|maam|madam|mam|teacher|miss)?|(?:thank(?:s| you)|dhanyavad|shukriya)\s*(?:sir|maam|madam|mam|teacher|miss)?|(?:ok|okay|k|hmm+|hmmm+))\s*[.!]*$/i;

const MASH_WORDS = new Set([
  'asdf', 'asdfg', 'asdfgh', 'asdfghjkl', 'asdg', 'qwert', 'qwerty',
  'qwertyuiop', 'werty', 'jkl', 'jk', 'kl', 'zxcv', 'zxcvb', 'zxcvbnm',
  'hjkl', 'dfgh', 'ghjk', 'tyui', 'test', 'tests', 'testing', 'hehe',
  'haha', 'hihi', 'hmm', 'hmmm', 'ok', 'okay', 'ooo', 'zzz', 'aaa', 'abc',
  'abcd', 'xyz', 'blah', 'meh',
]);

module.exports = {
  ACADEMIC_SUBJECTS,
  ACADEMIC_REQUESTS,
  ACADEMIC_EXEMPT_TOPICS,
  ACADEMIC_SUBJECT_SET,
  ACADEMIC_REQUEST_SET,
  ACADEMIC_EXEMPT_SET,
  ACADEMIC_STRONG_SET,
  SOCIAL_PATTERNS,
  PROMO_PATTERNS,
  ABUSE_STRONG,
  ABUSE_MILD,
  INJECTION_PATTERNS,
  PROBE_TOPIC,
  SHORT_REF,
  GREETING_ONLY,
  MASH_WORDS,
};
