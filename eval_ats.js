/**
 * resumessi — ATS Prompt Evaluation Harness
 * 
 * Run with:  node eval_ats.js
 * 
 * Tests the ATS prompt against known scenarios to verify:
 *  - Domain mismatch is caught (football JD vs software engineer resume)
 *  - Identity lock works (no hallucinated names)
 *  - Required skills cap score correctly
 *  - JSON output structure is valid
 * 
 * Configure your .env with AI_API_KEY and AI_MODEL before running.
 */

const fs = require('fs');
const path = require('path');

// Load .env file (simple parser)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function callLLM(prompt, env) {
  const apiKey = env.AI_API_KEY;
  const model = env.AI_MODEL || 'gemini-2.5-flash';
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0 }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  let text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) || '';
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(text);
}

// ─── Test Cases ─────────────────────────────────────────────────────────────
const testCases = [
  {
    name: 'DOMAIN MISMATCH — Football JD vs Messi Resume',
    jd: 'Global Football Icon, Playmaker, and Captain. Offensive Orchestration, Elite Goal Scoring, Team Leadership, Tactical Versatility.',
    resume: 'Lionel Messi\nProfessional Football Player\nWorld-class forward with 20+ years experience. 8x Ballon d\'Or winner. All-time top scorer for FC Barcelona.\nSkills: Dribbling, Playmaking, Goal Scoring, Vision, Ball Control, Leadership.',
    expect: {
      tier: 'LOW_MATCH',
      maxScore: 40,
      candidateName: 'Lionel Messi',
      noHallucinatedNames: ['Samantha', 'Alex Johnson', 'John Doe', 'Smith']
    }
  },
  {
    name: 'SOFTWARE ENGINEER — Missing critical skills',
    jd: 'Senior Software Engineer (Java, Microservices). Requirements: Java, Spring Boot, Microservices, AWS, Docker, Kubernetes, PostgreSQL, 5+ years experience.',
    resume: 'Maria Garcia\nFull Stack Developer\n3 years of experience with Python, Django, React, and MySQL. Strong background in web development and REST APIs.\nSkills: Python, Django, React, JavaScript, SQL, Git.',
    expect: {
      tier: 'LOW_MATCH',
      maxScore: 59,
      candidateName: 'Maria Garcia'
    }
  },
  {
    name: 'STRONG MATCH — Aligned profile',
    jd: 'Senior Software Engineer (Java, Microservices). Requirements: Java, Spring Boot, Microservices, AWS, Docker, Kubernetes, PostgreSQL, 8+ years experience.',
    resume: 'Carlos Ruiz\nSenior Java Developer\n10 years of experience in Java and Spring Boot. Led microservices migration on AWS with Docker and Kubernetes. PostgreSQL expert.\nSkills: Java, Spring Boot, Microservices, AWS, Docker, Kubernetes, PostgreSQL, CI/CD.',
    expect: {
      tier: 'STRONG_MATCH',
      minScore: 80,
      candidateName: 'Carlos Ruiz'
    }
  }
];

// ─── Load Prompt ─────────────────────────────────────────────────────────────
function loadPrompt() {
  const promptPath = path.join(__dirname, 'ATS_SCAN_PROMPT.md');
  const content = fs.readFileSync(promptPath, 'utf8');
  // Extract the code-block prompt (handles ``` and ``` fences)
  const match = content.match(/```[\s\S]*?\n([\s\S]*?)\n```/);
  if (!match) throw new Error('Could not extract prompt from ATS_SCAN_PROMPT.md');
  return match[1];
}

// ─── Evaluation Runner ───────────────────────────────────────────────────────
async function runEvals() {
  const env = loadEnv();
  if (!env.AI_API_KEY) {
    console.error('ERROR: AI_API_KEY not found in .env');
    console.error('Copy .env.example to .env and set your API key.');
    process.exit(1);
  }

  const basePrompt = loadPrompt();
  const results = [];

  for (const tc of testCases) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Running: ${tc.name}`);
    console.log(`${'─'.repeat(60)}`);

    const prompt = basePrompt
      .replace('{job_description}', tc.jd)
      .replace('{resume_text}', tc.resume);

    try {
      const result = await callLLM(prompt, env);
      const screening = result.ai_screening;
      
      let pass = true;
      const failures = [];

      // Check tier
      if (tc.expect.tier && screening.tier !== tc.expect.tier) {
        pass = false;
        failures.push(`Expected tier ${tc.expect.tier}, got ${screening.tier}`);
      }

      // Check score bounds
      if (tc.expect.maxScore !== undefined && screening.overall_score > tc.expect.maxScore) {
        pass = false;
        failures.push(`Score ${screening.overall_score} exceeds max ${tc.expect.maxScore}`);
      }
      if (tc.expect.minScore !== undefined && screening.overall_score < tc.expect.minScore) {
        pass = false;
        failures.push(`Score ${screening.overall_score} below min ${tc.expect.minScore}`);
      }

      // Check candidate name in feedback
      const feedbackLower = (screening.feedback || '').toLowerCase();
      const expectedName = (tc.expect.candidateName || '').toLowerCase();
      if (expectedName && !feedbackLower.includes(expectedName)) {
        pass = false;
        failures.push(`Candidate name "${tc.expect.candidateName}" not found in feedback`);
      }

      // Check no hallucinated names
      if (tc.expect.noHallucinatedNames) {
        for (const badName of tc.expect.noHallucinatedNames) {
          if (feedbackLower.includes(badName.toLowerCase())) {
            pass = false;
            failures.push(`Hallucinated name found: "${badName}"`);
          }
        }
      }

      results.push({ name: tc.name, pass, failures, screening });

      if (pass) {
        console.log(`✅ PASS — Score: ${screening.overall_score} | Tier: ${screening.tier}`);
      } else {
        console.log(`❌ FAIL — Score: ${screening.overall_score} | Tier: ${screening.tier}`);
        for (const f of failures) console.log(`   • ${f}`);
      }
      console.log(`   Feedback: ${(screening.feedback || '').substring(0, 150)}...`);

    } catch (err) {
      console.log(`💥 ERROR: ${err.message}`);
      results.push({ name: tc.name, pass: false, failures: [err.message], screening: null });
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total}`);
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} ${r.name}`);
  }
  if (passed < total) {
    console.log('\n⚠️  Some tests failed. Review the failures above and adjust the prompt.');
    process.exit(1);
  } else {
    console.log('\n🏆 All tests passed!');
  }
}

runEvals();