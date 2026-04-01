const pdfParse = require('pdf-parse');
const VALID_CATEGORIES = [
  'Billing Issue',
  'Technical Issue',
  'Service Complaint',
  'Account Problem',
  'Delivery Issue'
]

const DEPT_MAP = {
  'Billing Issue': 'Finance Department',
  'Technical Issue': 'IT Department',
  'Service Complaint': 'Customer Experience',
  'Account Problem': 'Security & Accounts',
  'Delivery Issue': 'Logistics Department',
  'Unknown': 'General Support'
}

// ─── Priority Engine ───────────────────────────────────────────────────────────

function getPriority(text, category) {
  const lower = text.toLowerCase()

  const urgentKeywords = [
    'urgent', 'immediately', 'asap', 'broken', 'critical',
    'emergency', 'safety', 'danger', 'outage', 'down', 'hack',
    'fraud', 'stolen', 'unauthorized'
  ]
  const mediumKeywords = [
    'waiting', 'delay', 'issue', 'problem', 'slow', 'error',
    'glitch', 'bug', 'wrong', 'incorrect', 'missing', 'failed'
  ]

  if (urgentKeywords.some(kw => lower.includes(kw))) return 'High'

  if (category === 'Technical Issue' || category === 'Billing Issue') {
    if (mediumKeywords.some(kw => lower.includes(kw))) return 'High'
    return 'Medium'
  }

  if (mediumKeywords.some(kw => lower.includes(kw))) return 'Medium'

  return 'Low'
}

// ─── LLM Classification Prompt ─────────────────────────────────────────────────

function buildClassificationPrompt(complaintText) {
  return [
    {
      role: 'system',
      content: `You are a complaint classification AI. Classify the complaint into EXACTLY ONE of these categories:
- Billing Issue
- Technical Issue
- Service Complaint
- Account Problem
- Delivery Issue

Respond with ONLY a JSON object in this exact format, nothing else:
{"category": "<category>", "confidence": <0.0-1.0>}

Rules:
- category MUST be one of the 5 categories listed above (exact spelling)
- confidence is how certain you are (0.0 to 1.0)
- Do NOT include any other text, explanation, or markdown formatting`
    },
    {
      role: 'user',
      content: complaintText
    }
  ]
}

// ─── TIER 1: NVIDIA NIM API ────────────────────────────────────────────────────

async function classifyWithNvidia(complaintText) {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY not configured')

  const url = 'https://integrate.api.nvidia.com/v1/chat/completions'
  const body = JSON.stringify({
    model: 'meta/llama-3.1-8b-instruct',
    messages: buildClassificationPrompt(complaintText),
    temperature: 0.1,
    max_tokens: 100,
    top_p: 0.9
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body,
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      throw new Error(`NVIDIA API ${res.status}: ${errText}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) throw new Error('Empty NVIDIA response')

    const parsed = parseLLMResponse(content)
    return { ...parsed, classifiedBy: 'nvidia' }
  } catch (err) {
    clearTimeout(timeout)
    throw new Error(`NVIDIA: ${err.message}`)
  }
}


// ─── TIER 3: Keyword Heuristics ────────────────────────────────────────────────

function classifyWithKeywords(complaintText) {
  const lower = complaintText.toLowerCase()

  const keywordMap = {
    'Billing Issue': [
      'bill', 'charge', 'payment', 'refund', 'invoice', 'price',
      'fee', 'cost', 'overcharge', 'money', 'deducted', 'transaction',
      'credit', 'debit', 'subscription', 'plan', 'pricing'
    ],
    'Technical Issue': [
      'crash', 'bug', 'error', 'loading', 'server', 'app', 'website',
      'software', 'hardware', 'update', 'install', 'code', 'api',
      'network', 'connection', 'lag', 'performance', 'glitch', 'freeze',
      'screen', 'display', 'broken feature'
    ],
    'Service Complaint': [
      'rude', 'unprofessional', 'bad service', 'poor', 'terrible',
      'wait time', 'hold', 'representative', 'agent', 'support',
      'manager', 'staff', 'experience', 'disappointed', 'unhelpful',
      'attitude', 'behaviour', 'behavior'
    ],
    'Account Problem': [
      'login', 'password', 'account', 'locked', 'access', 'profile',
      'authentication', 'verification', 'otp', 'email change',
      'username', 'security', 'two factor', '2fa', 'sign in',
      'sign up', 'register', 'credentials'
    ],
    'Delivery Issue': [
      'delivery', 'shipping', 'package', 'parcel', 'courier',
      'tracking', 'shipment', 'delivered', 'arrived', 'dispatch',
      'late delivery', 'damaged', 'wrong item', 'lost package',
      'order status', 'porch', 'warehouse'
    ]
  }

  const scores = {}

  for (const [category, keywords] of Object.entries(keywordMap)) {
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score++
    }
    scores[category] = score
  }

  const entries = Object.entries(scores)
  const maxEntry = entries.reduce((a, b) => a[1] >= b[1] ? a : b)
  const totalScore = entries.reduce((sum, e) => sum + e[1], 0)

  if (maxEntry[1] === 0) {
    return {
      category: 'Unknown',
      confidence: 0,
      classifiedBy: 'keywords'
    }
  }

  return {
    category: maxEntry[0],
    confidence: parseFloat((totalScore > 0 ? maxEntry[1] / totalScore : 0).toFixed(4)),
    classifiedBy: 'keywords'
  }
}

// ─── LLM Response Parser ───────────────────────────────────────────────────────

function parseLLMResponse(raw) {
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        throw new Error('Cannot parse LLM response: ' + raw.slice(0, 200))
      }
    } else {
      throw new Error('No JSON in LLM response: ' + raw.slice(0, 200))
    }
  }

  const category = parsed.category || parsed.label || 'Unknown'
  let confidence = parseFloat(parsed.confidence ?? parsed.score ?? 0)

  if (!VALID_CATEGORIES.includes(category)) {
    const fuzzy = VALID_CATEGORIES.find(c =>
      c.toLowerCase().includes(category.toLowerCase()) ||
      category.toLowerCase().includes(c.toLowerCase())
    )
    if (fuzzy) {
      return { category: fuzzy, confidence: Math.min(confidence, 0.7) }
    }
    throw new Error('Invalid category from LLM: "' + category + '"')
  }

  confidence = Math.max(0, Math.min(1, confidence))

  return { category, confidence }
}

// ─── Main Predict Function (Fallback Chain) ─────────────────────────────────────

async function predict(text) {
  const errors = []

  // Tier 1: NVIDIA NIM
  try {
    const result = await classifyWithNvidia(text)
    console.log('[NVIDIA] Classified as "' + result.category + '" (' + (result.confidence * 100).toFixed(1) + '%)')
    const department = DEPT_MAP[result.category] || DEPT_MAP['Unknown']
    const priority = getPriority(text, result.category)
    return { ...result, department, priority }
  } catch (err) {
    errors.push(err.message)
    console.warn('[NVIDIA] Failed: ' + err.message)
  }


  // Tier 3: Keywords (always works)
  console.log('[Keywords] Using heuristic fallback')
  const result = classifyWithKeywords(text)
  const department = DEPT_MAP[result.category] || DEPT_MAP['Unknown']
  const priority = getPriority(text, result.category)

  if (errors.length > 0) {
    console.warn('Fallback chain errors: ' + errors.join(' | '))
  }

  return { ...result, department, priority }
}

// ─── File Attachment Parsing (Gemini + PDF) ───────────────────────────────────

async function parseFileAttachment(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      return `\n[Attached PDF Content]\n${data.text.trim().slice(0, 3000)}`; // Cap to 3k chars to save context
    } catch (e) {
      console.warn('PDF Parse error:', e.message);
      return '\n[Attached PDF Content: Unreadable]';
    }
  } else if (mimeType.startsWith('image/')) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const body = {
        contents: [{
          parts: [
            { text: "Describe this image in detail. Focus on any errors, broken items, or specific details shown, as this is an attachment to a support complaint." },
            { inlineData: { mimeType, data: buffer.toString('base64') } }
          ]
        }]
      };
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }
      
      const data = await res.json();
      const description = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No description generated.';
      return `\n[Attached Image Description]\n${description}`;
    } catch (e) {
      console.warn('Gemini Image Parse error:', e.message);
      return '\n[Attached Image Content: Unreadable]';
    }
  }
  return '';
}

module.exports = { predict, getPriority, classifyWithKeywords, VALID_CATEGORIES, DEPT_MAP, parseFileAttachment }