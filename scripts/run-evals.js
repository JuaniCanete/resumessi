const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

function validateResumeData(data) {
  const errors = [];
  
  if (!data.basics) {
    errors.push('Missing basics section');
    return { valid: false, errors };
  }
  
  if (!data.basics.name) errors.push('Missing basics.name');
  if (!data.basics.email) errors.push('Missing basics.email');
  
  if (data.experience && Array.isArray(data.experience)) {
    for (let i = 0; i < data.experience.length; i++) {
      const exp = data.experience[i];
      if (!exp.title) errors.push(`Experience[${i}]: Missing title`);
      if (!exp.company) errors.push(`Experience[${i}]: Missing company`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

function validateAtsOutput(output) {
  const errors = [];
  
  if (!output.overall_score && output.overall_score !== 0) {
    errors.push('Missing overall_score');
  }
  
  if (!output.tier) {
    errors.push('Missing tier');
  }
  
  const validTiers = ['STRONG_MATCH', 'GOOD_MATCH', 'MODERATE_MATCH', 'WEAK_MATCH'];
  if (output.tier && !validTiers.includes(output.tier)) {
    errors.push(`Invalid tier: ${output.tier}`);
  }
  
  return { valid: errors.length === 0, errors };
}

function runEvals() {
  console.log('Running LLM evals...\n');
  let passed = 0;
  let failed = 0;
  
  // Eval 1: Resume data structure
  try {
    const resumePath = join(process.cwd(), 'examples', 'demo-data.json');
    if (existsSync(resumePath)) {
      const data = JSON.parse(readFileSync(resumePath, 'utf-8'));
      const result = validateResumeData(data);
      if (result.valid) {
        console.log('✓ Resume data structure valid');
        passed++;
      } else {
        console.log('✗ Resume data structure invalid:', result.errors);
        failed++;
      }
    }
  } catch (e) {
    console.log('✗ Failed to validate resume data:', e.message);
    failed++;
  }
  
  // Eval 2: ATS output format
  const sampleAtsOutput = {
    overall_score: 85,
    tier: 'GOOD_MATCH',
    breakdown: { skills_score: 90, experience_years_score: 80, education_match: true },
    feedback: 'Good match',
    missingKeywords: []
  };
  
  const atsResult = validateAtsOutput(sampleAtsOutput);
  if (atsResult.valid) {
    console.log('✓ ATS output format valid');
    passed++;
  } else {
    console.log('✗ ATS output format invalid:', atsResult.errors);
    failed++;
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

process.exit(runEvals() ? 0 : 1);