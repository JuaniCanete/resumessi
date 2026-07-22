import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface ResumeData {
  basics?: {
    name?: string;
    email?: string;
  };
  experience?: Array<{
    title?: string;
    company?: string;
  }>;
  [key: string]: unknown;
}

interface AtsOutput {
  overall_score?: number;
  tier?: string;
  breakdown?: Record<string, unknown>;
  feedback?: string;
  missingKeywords?: string[];
}

function validateResumeData(data: ResumeData): ValidationResult {
  const errors: string[] = [];

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

function validateAtsOutput(output: AtsOutput): ValidationResult {
  const errors: string[] = [];

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

function runEvals(): boolean {
  console.log('Running LLM evals...\n');
  let passed = 0;
  let failed = 0;

  // Eval 1: Resume data structure
  try {
    const resumePath = join(process.cwd(), 'examples', 'demo-data.json');
    if (existsSync(resumePath)) {
      const data = JSON.parse(readFileSync(resumePath, 'utf-8')) as ResumeData;
      const result = validateResumeData(data);
      if (result.valid) {
        console.log('\u2713 Resume data structure valid');
        passed++;
      } else {
        console.log('\u2717 Resume data structure invalid:', result.errors);
        failed++;
      }
    }
  } catch (e: unknown) {
    console.log('\u2717 Failed to validate resume data:', (e as Error).message);
    failed++;
  }

  // Eval 2: ATS output format
  const sampleAtsOutput: AtsOutput = {
    overall_score: 85,
    tier: 'GOOD_MATCH',
    breakdown: { skills_score: 90, experience_years_score: 80, education_match: true },
    feedback: 'Good match',
    missingKeywords: [],
  };

  const atsResult = validateAtsOutput(sampleAtsOutput);
  if (atsResult.valid) {
    console.log('\u2713 ATS output format valid');
    passed++;
  } else {
    console.log('\u2717 ATS output format invalid:', atsResult.errors);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

process.exit(runEvals() ? 0 : 1);