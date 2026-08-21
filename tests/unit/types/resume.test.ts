import { test } from 'node:test';
import assert from 'node:assert/strict';

test('src/types/resume.ts - ResumeBasics shape validation', () => {
  const basics = {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1-555-000-0000',
    location: 'Remote',
    photo: 'photo.jpg',
    url: 'https://linkedin.com/in/johndoe',
    summary: 'Experienced software engineer',
  };
  
  assert.ok(basics.name);
  assert.ok(basics.email);
  assert.ok(basics.phone);
  assert.ok(basics.location);
  assert.ok(basics.photo);
  assert.ok(basics.url);
  assert.ok(basics.summary);
});

test('src/types/resume.ts - ResumeExperience shape validation', () => {
  const experience = {
    title: 'Senior Software Engineer',
    company: 'Tech Corp',
    location: 'San Francisco, CA',
    startDate: '2022-01-01',
    endDate: '2024-01-01',
    description: 'Led backend team',
    highlights: ['Scaled API to 1M req/s', 'Reduced latency by 50%'],
  };
  
  assert.ok(experience.title);
  assert.ok(experience.company);
  assert.ok(experience.location);
  assert.ok(experience.startDate);
  assert.ok(experience.endDate);
  assert.ok(experience.description);
  assert.ok(Array.isArray(experience.highlights));
});

test('src/types/resume.ts - ResumeEducation shape validation', () => {
  const education = {
    institution: 'University of Example',
    degree: 'Bachelor of Science',
    field: 'Computer Science',
    startDate: '2018-09-01',
    endDate: '2022-06-01',
    gpa: '3.8',
  };
  
  assert.ok(education.institution);
  assert.ok(education.degree);
  assert.ok(education.field);
  assert.ok(education.startDate);
  assert.ok(education.endDate);
  assert.ok(education.gpa);
});

test('src/types/resume.ts - ResumeData shape validation', () => {
  const resume = {
    basics: {
      name: 'John Doe',
      email: 'john@example.com',
    },
    experience: [
      { title: 'Engineer', company: 'Corp', startDate: '2022-01-01' },
    ],
    education: [
      { institution: 'Uni', degree: 'BS', endDate: '2022-06-01' },
    ],
    skills: { 'Core Skills': ['JavaScript', 'TypeScript'] },
    projects: [],
    certifications: [],
    languages: ['English'],
  };
  
  assert.ok(resume.basics);
  assert.ok(Array.isArray(resume.experience));
  assert.ok(Array.isArray(resume.education));
  assert.ok(resume.skills);
  assert.ok(Array.isArray(resume.projects));
  assert.ok(Array.isArray(resume.certifications));
  assert.ok(Array.isArray(resume.languages));
});

test('src/types/resume.ts - ATSOutput shape validation', () => {
  const atsOutput = {
    overall_score: 85,
    tier: 'GOOD_MATCH' as const,
    breakdown: {
      skills_score: 90,
      experience_years_score: 80,
      education_match: true,
    },
    feedback: 'Good match for the role',
    missingKeywords: ['Playwright', 'E2E Testing'],
  };
  
  assert.ok(typeof atsOutput.overall_score === 'number');
  assert.ok(atsOutput.overall_score >= 0 && atsOutput.overall_score <= 100);
  assert.ok(['STRONG_MATCH', 'GOOD_MATCH', 'MODERATE_MATCH', 'WEAK_MATCH'].includes(atsOutput.tier));
  assert.ok(atsOutput.breakdown);
  assert.ok(typeof atsOutput.breakdown.skills_score === 'number');
  assert.ok(typeof atsOutput.breakdown.experience_years_score === 'number');
  assert.ok(typeof atsOutput.breakdown.education_match === 'boolean');
  assert.ok(atsOutput.feedback);
  assert.ok(Array.isArray(atsOutput.missingKeywords));
});