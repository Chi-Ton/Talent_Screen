export type JobDraft = {
  title: string;
  department: string;
  employmentType: string;
  seniority: string;
  workMode: string;
  location: string;
  openings: string;
  description: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  minimumExperienceYears: number;
  strictExperience: boolean;
  degree: string;
  fieldsOfStudy: string[];
  scoringWeights: {
    technicalSkills: number;
    experience: number;
    projects: number;
    systemsCloud: number;
    educationCertifications: number;
  };
  disqualifiers: {
    missingSkills: boolean;
    insufficientExperience: boolean;
    missingCertification: boolean;
  };
  createdJobId?: string;
};

export const defaultJobDraft: JobDraft = {
  title: "",
  department: "",
  employmentType: "",
  seniority: "",
  workMode: "",
  location: "",
  openings: "1",
  description: "",
  mustHaveSkills: ["Java", "Spring Boot", "PostgreSQL"],
  niceToHaveSkills: ["Docker", "AWS"],
  minimumExperienceYears: 2,
  strictExperience: true,
  degree: "Bachelor's Degree",
  fieldsOfStudy: ["Computer Science", "Information Tech"],
  scoringWeights: {
    technicalSkills: 40,
    experience: 25,
    projects: 15,
    systemsCloud: 10,
    educationCertifications: 10
  },
  disqualifiers: {
    missingSkills: true,
    insufficientExperience: false,
    missingCertification: false
  }
};

const DRAFT_KEY = "talentscreen.job-draft";

export function loadJobDraft(): JobDraft {
  if (typeof window === "undefined") return defaultJobDraft;
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return defaultJobDraft;
  try {
    return { ...defaultJobDraft, ...JSON.parse(raw) } as JobDraft;
  } catch {
    window.sessionStorage.removeItem(DRAFT_KEY);
    return defaultJobDraft;
  }
}

export function saveJobDraft(draft: JobDraft) {
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearJobDraft() {
  window.sessionStorage.removeItem(DRAFT_KEY);
}

