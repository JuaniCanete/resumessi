export interface ResumeBasics {
	name: string;
	email: string;
	phone?: string;
	location?: string;
	photo?: string;
	url?: string;
	summary?: string;
}

export interface ResumeExperience {
	title: string;
	company: string;
	location?: string;
	startDate: string;
	endDate?: string;
	description?: string;
	highlights?: string[];
}

export interface ResumeEducation {
	institution: string;
	degree: string;
	field?: string;
	startDate?: string;
	endDate?: string;
	gpa?: string;
}

export interface ResumeSkill {
	name: string;
	level?: string;
	keywords?: string[];
}

export interface ResumeProject {
	name: string;
	description?: string;
	url?: string;
	highlights?: string[];
	keywords?: string[];
}

export interface ResumeCertification {
	name: string;
	issuer?: string;
	date?: string;
	url?: string;
}

export interface ResumeData {
	basics: ResumeBasics;
	experience?: ResumeExperience[];
	education?: ResumeEducation[];
	skills?: ResumeSkill[] | Record<string, string[]>;
	projects?: ResumeProject[];
	certifications?: ResumeCertification[];
	languages?: string[];
	interests?: string[];
	[key: string]: unknown;
}

export interface ATSScoreBreakdown {
	skills_score: number;
	experience_years_score: number;
	education_match: boolean;
	[key: string]: unknown;
}

export interface ATSOutput {
	overall_score: number;
	tier: 'STRONG_MATCH' | 'GOOD_MATCH' | 'MODERATE_MATCH' | 'WEAK_MATCH';
	breakdown: ATSScoreBreakdown;
	feedback: string;
	missingKeywords: string[];
}

export interface ExtractedResumeData {
	name: string;
	contact: Record<string, string>;
	experience: Array<{
		company: string;
		role: string;
		duration: string;
		highlights: string[];
	}>;
	skills: string[];
	education: Array<{
		institution: string;
		degree: string;
		year: string;
	}>;
}
