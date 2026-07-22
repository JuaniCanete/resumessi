/**
 * tests/fixtures/resume-fixtures.ts
 *
 * Test data for E2E and unit tests.
 * Exports resumeFixtures and jobDescriptionFixtures directly.
 */

export interface ResumeBasics {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  photo?: string | null;
  title?: string;
}

export interface ResumeExperience {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string | null;
  location?: string;
  bullets?: string[];
}

export interface ResumeEducation {
  degree: string;
  institution: string;
  year: string;
}

export interface ResumeSkill {
  name: string;
  expert: boolean;
}

export interface ResumeData {
  basics: ResumeBasics;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: Record<string, ResumeSkill[]>;
  [key: string]: unknown;
}

export const resumeFixtures: Record<string, ResumeData> = {
  minimal: {
    basics: {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+1-555-000-0000',
      location: 'Remote',
      photo: null,
    },
    experience: [],
    education: [],
    skills: {},
  },
  full: {
    basics: {
      name: 'Lionel Messi',
      email: 'leo@messi.com',
      phone: '+54-341-000-0000',
      location: 'Miami, FL',
      title: 'Professional Footballer',
      photo: 'photo.jpg',
    },
    experience: [
      {
        title: 'Forward',
        company: 'Inter Miami CF',
        startDate: '2023-07',
        endDate: null,
        location: 'Miami, FL',
        bullets: ['Led team in goals scored', 'Won MLS Cup 2023'],
      },
    ],
    education: [
      {
        degree: 'La Masia Academy',
        institution: 'FC Barcelona',
        year: '2004',
      },
    ],
    skills: { 'Core Skills': [{ name: 'Leadership', expert: true }, { name: 'Teamwork', expert: false }, { name: 'Free kicks', expert: true }, { name: 'Dribbling', expert: true }] },
  },
};

export const jobDescriptionFixtures: Record<string, string> = {
  minimal: 'Looking for an experienced professional to join our team.',
  full: `We are looking for a world-class Forward to join our MLS team.

Requirements:
- 10+ years of professional experience
- Strong leadership and teamwork skills
- Experience scoring goals at the highest level
- Ability to perform under pressure

Nice to have:
- Multiple Ballon d'Or awards
- World Cup winner
- Champions League experience`,
};

/**
 * Error scenario fixtures for API error handling tests.
 */
export const apiErrorFixtures: Record<string, Record<string, unknown>> = {
  proxy500: { error: { message: 'Internal Server Error', status: 500 } },
  polishFailed: { error: 'Polish API timeout' },
  invalidImage: { message: 'Invalid file type. Please upload a JPEG, JPG or PNG image.' },
  parseFailed: { error: 'Failed to parse PDF' },
  emptyResponse: {},
};