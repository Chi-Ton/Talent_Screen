import os
import csv
import io
import json
import re
import ftfy
from collections import defaultdict
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import docx
from docx.shared import Pt, Inches, RGBColor

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
RAW_DIR = os.path.join(DATASET_DIR, "raw_dataset")
TXT_DIR = os.path.join(DATASET_DIR, "it_resumes_txt")
PDF_DIR = os.path.join(DATASET_DIR, "it_resumes_pdf")
DOCX_DIR = os.path.join(DATASET_DIR, "it_resumes_docx")
JD_DIR = os.path.join(DATASET_DIR, "sample_job_descriptions")
FRAMEWORK_DIR = os.path.join(DATASET_DIR, "hr_standards")

IT_CATEGORIES = {
    "Java Developer": "Java_Developer",
    "Python Developer": "Python_Developer",
    "DevOps Engineer": "DevOps_Engineer",
    "Data Science": "Data_Science_AI",
    "Web Designing": "Frontend_Web_Developer",
    "Database": "Database_Administrator",
    "DotNet Developer": "DotNet_Developer",
    "Network Security Engineer": "Network_Security_Engineer",
    "Testing": "QA_Automation_Testing",
    "Blockchain": "Blockchain_Developer",
    "Hadoop": "BigData_Hadoop_Engineer",
    "ETL Developer": "ETL_Data_Engineer"
}

def setup_directories():
    for d in [RAW_DIR, TXT_DIR, PDF_DIR, DOCX_DIR, JD_DIR, FRAMEWORK_DIR]:
        os.makedirs(d, exist_ok=True)
    for folder_name in IT_CATEGORIES.values():
        os.makedirs(os.path.join(TXT_DIR, folder_name), exist_ok=True)
        os.makedirs(os.path.join(PDF_DIR, folder_name), exist_ok=True)
        os.makedirs(os.path.join(DOCX_DIR, folder_name), exist_ok=True)

def deep_clean_text(raw_text):
    if not raw_text:
        return ""
    # 1. Fix Mojibake via ftfy
    text = ftfy.fix_text(raw_text)
    
    # 2. Targeted artifact cleanup
    replacements = {
        'Ã¢Â€Â¢': '• ',
        'â€¢': '• ',
        'Ã¢Â€Â“': '–',
        'Ã¢Â€Â—': '—',
        'Ã¢Â€Â™': "'",
        'â€™': "'",
        'â€œ': '"',
        'â€': '"',
        'Ã‚Â': ' ',
        'Â': ' ',
        '\xa0': ' ',
        '\t': ' ',
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
        
    # 3. Clean spacing and structure major sections cleanly
    text = re.sub(r'([a-z])([A-Z][a-z])', r'\1 \2', text) # fix concatenated CamelCase words like CollegePersonality
    
    # Standardize major resume headers onto new lines
    headers = [
        "Education Details", "Skill Details", "Company Details", 
        "Work Experience", "Working Experience", "Experience Details",
        "Project Details", "Technical Skills", "Key Skills", 
        "Certifications", "Responsibilities", "Summary", "Profile"
    ]
    for h in headers:
        text = re.sub(rf'(?i)\b{h}\b', f'\n\n=== {h.upper()} ===\n', text)
        
    # Replace multiple bullets/newlines
    text = re.sub(r'\s*•\s*', '\n• ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def create_pdf_resume(file_path, candidate_name, category, text):
    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#1A365D')
    )
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#2B6CB0')
    )
    header_style = ParagraphStyle(
        'DocHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#1A365D')
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1E293B')
    )
    bullet_style = ParagraphStyle(
        'DocBullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        leftIndent=15,
        textColor=colors.HexColor('#1E293B')
    )
    
    story = []
    story.append(Paragraph(f"<b>{candidate_name}</b>", title_style))
    story.append(Paragraph(f"Target Role: {category} | Verified IT Candidate Profile", subtitle_style))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=8))
    
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        safe_line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        
        if safe_line.startswith('===') and safe_line.endswith('==='):
            header_text = safe_line.replace('=', '').strip()
            story.append(Spacer(1, 6))
            story.append(Paragraph(f"<b>{header_text}</b>", header_style))
            story.append(Spacer(1, 3))
        elif safe_line.startswith('•'):
            story.append(Paragraph(safe_line, bullet_style))
            story.append(Spacer(1, 2))
        else:
            story.append(Paragraph(safe_line, body_style))
            story.append(Spacer(1, 3))
            
    doc.build(story)

def create_docx_resume(file_path, candidate_name, category, text):
    doc = docx.Document()
    for s in doc.sections:
        s.top_margin = Inches(0.7)
        s.bottom_margin = Inches(0.7)
        s.left_margin = Inches(0.7)
        s.right_margin = Inches(0.7)
        
    p_name = doc.add_paragraph()
    r_name = p_name.add_run(candidate_name)
    r_name.font.name = 'Arial'
    r_name.font.size = Pt(15)
    r_name.font.bold = True
    r_name.font.color.rgb = RGBColor(26, 54, 93)
    
    p_role = doc.add_paragraph()
    r_role = p_role.add_run(f"Target Domain: {category} | Standardized IT Resume")
    r_role.font.name = 'Arial'
    r_role.font.size = Pt(10)
    r_role.font.bold = True
    r_role.font.color.rgb = RGBColor(43, 108, 176)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        p_item = doc.add_paragraph()
        p_item.paragraph_format.space_after = Pt(2)
        p_item.paragraph_format.line_spacing = 1.15
        
        if line.startswith('===') and line.endswith('==='):
            header_text = line.replace('=', '').strip()
            r = p_item.add_run(header_text)
            r.font.name = 'Arial'
            r.font.size = Pt(11)
            r.font.bold = True
            r.font.color.rgb = RGBColor(26, 54, 93)
        elif line.startswith('•'):
            p_item.paragraph_format.left_indent = Inches(0.2)
            r = p_item.add_run(line)
            r.font.name = 'Arial'
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(30, 41, 59)
        else:
            r = p_item.add_run(line)
            r.font.name = 'Arial'
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(30, 41, 59)
            
    doc.save(file_path)

def create_hr_screening_standard():
    """
    Creates the standardized universal HR evaluation framework
    that AI uses to evaluate, score, and rank IT CVs objectively.
    """
    framework = {
        "framework_name": "Standardized IT Candidate Screening & Evaluation Rubric (S-IT-SR)",
        "version": "2.0",
        "description": "Universal 5-Pillar evaluation criteria benchmark used by global IT recruiters and HR professionals for objective technical profile screening.",
        "evaluation_pillars": [
            {
                "pillar_id": "P1_TECH_SKILLS",
                "name": "Core Technical Skills Match",
                "weight_percentage": 40,
                "description": "Evaluates the degree of alignment between candidate hands-on skills and job requirements.",
                "sub_criteria": [
                    {"name": "Must-Have Primary Technologies", "weight": 25, "rule": "Mandatory stack requirements (e.g. React, Java, AWS)"},
                    {"name": "Nice-to-Have Ecosystem Tools", "weight": 10, "rule": "Secondary tools (Docker, Redis, Tailwind, Jest)"},
                    {"name": "Skill Depth & Version Recency", "weight": 5, "rule": "Evidence of modern version usage vs outdated syntax"}
                ]
            },
            {
                "pillar_id": "P2_EXPERIENCE",
                "name": "Relevant Experience & Seniority",
                "weight_percentage": 25,
                "description": "Evaluates tenure in relevant technical roles and hands-on depth.",
                "sub_criteria": [
                    {"name": "Years of Relevant Experience", "weight": 15, "rule": "Direct alignment with JD minimum years (Junior 1-2y, Mid 3-4y, Senior 5y+)"},
                    {"name": "Career Progression & Role Consistency", "weight": 10, "rule": "Continuity in technical positions without unexplained gaps"}
                ]
            },
            {
                "pillar_id": "P3_PROJECTS",
                "name": "Project Complexity & Architecture Contribution",
                "weight_percentage": 15,
                "description": "Evaluates scale, complexity, and tangible impact of completed software projects.",
                "sub_criteria": [
                    {"name": "High-Scale & Production Experience", "weight": 8, "rule": "Experience with microservices, high concurrency, cloud deployments"},
                    {"name": "Quantifiable Achievements", "weight": 7, "rule": "Mention of measurable improvements (e.g., reduced latency by 30%, handled 50k DAU)"}
                ]
            },
            {
                "pillar_id": "P4_SYSTEMS_CLOUD",
                "name": "Database, DevOps & Cloud Foundations",
                "weight_percentage": 10,
                "description": "Fundamental engineering practices (Databases, CI/CD, Version Control).",
                "sub_criteria": [
                    {"name": "Database Proficiency (SQL/NoSQL)", "weight": 5, "rule": "PostgreSQL, MySQL, MongoDB, Redis"},
                    {"name": "DevOps & Tooling (Git, Docker, CI/CD)", "weight": 5, "rule": "Git workflows, containerization, automated testing"}
                ]
            },
            {
                "pillar_id": "P5_EDUCATION_CERTS",
                "name": "Education, Certifications & Communication",
                "weight_percentage": 10,
                "description": "Formal technical background, industry credentials, and professional communication.",
                "sub_criteria": [
                    {"name": "Degree / Formal Background", "weight": 5, "rule": "B.S./M.S. in CS/IT or proven equivalent self-taught track record"},
                    {"name": "Professional Certifications", "weight": 3, "rule": "AWS Certified, PMP, OCAJP, CKA, Scikit-Learn"},
                    {"name": "Language & Soft Skills", "weight": 2, "rule": "English proficiency, documentation, team collaboration"}
                ]
            }
        ],
        "scoring_scale": {
            "tier_1_strong_match": {"range": "85% - 100%", "recommendation": "Strong Recommend for Technical Interview"},
            "tier_2_potential_match": {"range": "70% - 84%", "recommendation": "Recommend with Minor Skill Check"},
            "tier_3_marginal_match": {"range": "50% - 69%", "recommendation": "Review Needed (Significant Skill/Experience Gap)"},
            "tier_4_unqualified": {"range": "0% - 49%", "recommendation": "Reject (Core Stack Mismatch)"}
        },
        "it_skill_semantic_taxonomy": {
            "Frontend": ["React", "ReactJS", "Next.js", "Vue", "Vue.js", "Angular", "TypeScript", "JavaScript", "Redux", "Tailwind CSS", "HTML5", "CSS3"],
            "Backend_Java": ["Java", "Spring Boot", "Spring MVC", "Hibernate", "JPA", "Maven", "Gradle", "Microservices", "REST API"],
            "Backend_Python": ["Python", "FastAPI", "Django", "Flask", "Celery", "Pydantic", "SQLAlchemy", "AsyncIO"],
            "DevOps_Cloud": ["AWS", "Amazon Web Services", "Docker", "Kubernetes", "K8s", "CI/CD", "Jenkins", "Terraform", "Linux", "GitLab CI", "Prometheus"],
            "Data_AI": ["Machine Learning", "Deep Learning", "Pandas", "NumPy", "Scikit-Learn", "PyTorch", "TensorFlow", "NLP", "LLM", "Data Analysis", "SQL"],
            "Database": ["PostgreSQL", "MySQL", "Oracle", "MongoDB", "Redis", "Elasticsearch", "SQL Server", "Database Indexing"]
        }
    }
    
    framework_file = os.path.join(FRAMEWORK_DIR, "standard_it_screening_rubric.json")
    with open(framework_file, "w", encoding="utf-8") as f:
        json.dump(framework, f, indent=2, ensure_ascii=False)
    print(f"[SUCCESS] Generated Standard HR Screening Framework at: {framework_file}")

def create_sample_job_descriptions():
    jds = [
        {
            "job_id": "JD-001",
            "title": "Senior React / Frontend Developer",
            "department": "Engineering",
            "experience_required_years": 3,
            "must_have_skills": ["React", "JavaScript", "TypeScript", "HTML5", "CSS3", "Redux", "REST API"],
            "nice_to_have_skills": ["Next.js", "Tailwind CSS", "GraphQL", "Jest", "CI/CD"],
            "education": "Bachelor in Computer Science or related field",
            "description": "We are seeking a Senior React Frontend Developer to build scalable, responsive web dashboards and integrate complex RESTful APIs. Must have strong understanding of React hooks, state management, and modern UI engineering.",
            "evaluation_rubric_weights": {
                "P1_TECH_SKILLS": 40,
                "P2_EXPERIENCE": 25,
                "P3_PROJECTS": 15,
                "P4_SYSTEMS_CLOUD": 10,
                "P5_EDUCATION_CERTS": 10
            }
        },
        {
            "job_id": "JD-002",
            "title": "Java Backend Engineer (Spring Boot)",
            "department": "Backend Core",
            "experience_required_years": 2,
            "must_have_skills": ["Java", "Spring Boot", "Hibernate", "PostgreSQL", "REST API", "Microservices", "Maven"],
            "nice_to_have_skills": ["Kafka", "Docker", "Redis", "AWS", "JUnit"],
            "education": "Bachelor Degree in IT / Software Engineering",
            "description": "Looking for a Java Backend Engineer with hands-on experience in building microservices using Spring Boot, JPA/Hibernate, and relational databases. Experience with asynchronous messaging (Kafka/RabbitMQ) is a major plus.",
            "evaluation_rubric_weights": {
                "P1_TECH_SKILLS": 40,
                "P2_EXPERIENCE": 25,
                "P3_PROJECTS": 15,
                "P4_SYSTEMS_CLOUD": 10,
                "P5_EDUCATION_CERTS": 10
            }
        },
        {
            "job_id": "JD-003",
            "title": "DevOps & Cloud Infrastructure Engineer",
            "department": "Infrastructure & Operations",
            "experience_required_years": 3,
            "must_have_skills": ["AWS", "Docker", "Kubernetes", "Linux", "CI/CD", "Terraform", "Git"],
            "nice_to_have_skills": ["Prometheus", "Grafana", "Python", "Bash Scripting", "Ansible"],
            "education": "BS in Computer Science / IT or AWS Certified",
            "description": "Responsible for managing high-availability cloud infrastructure on AWS, container orchestration with Kubernetes, and automating zero-downtime CI/CD pipelines.",
            "evaluation_rubric_weights": {
                "P1_TECH_SKILLS": 40,
                "P2_EXPERIENCE": 25,
                "P3_PROJECTS": 15,
                "P4_SYSTEMS_CLOUD": 10,
                "P5_EDUCATION_CERTS": 10
            }
        },
        {
            "job_id": "JD-004",
            "title": "Data Scientist & AI/ML Engineer",
            "department": "AI & Analytics",
            "experience_required_years": 2,
            "must_have_skills": ["Python", "Machine Learning", "Pandas", "NumPy", "Scikit-Learn", "SQL", "NLP"],
            "nice_to_have_skills": ["PyTorch", "TensorFlow", "FastAPI", "LLM Fine-tuning", "LangChain"],
            "education": "Bachelor or Master in Computer Science, Data Science, or Mathematics",
            "description": "Design and deploy machine learning models and NLP pipelines into production. Experience with LLMs and structured text processing is highly valued.",
            "evaluation_rubric_weights": {
                "P1_TECH_SKILLS": 40,
                "P2_EXPERIENCE": 25,
                "P3_PROJECTS": 15,
                "P4_SYSTEMS_CLOUD": 10,
                "P5_EDUCATION_CERTS": 10
            }
        }
    ]
    for jd in jds:
        file_path = os.path.join(JD_DIR, f"{jd['job_id']}_{jd['title'].replace(' ', '_').replace('/', '_')}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(jd, f, indent=2, ensure_ascii=False)
    print(f"[SUCCESS] Created {len(jds)} sample Job Descriptions in {JD_DIR}")

def clean_and_process_dataset():
    csv_raw_path = os.path.join(RAW_DIR, "UpdatedResumeDataSet.csv")
    csv_clean_path = os.path.join(RAW_DIR, "UpdatedResumeDataSet_Cleaned.csv")
    
    with open(csv_raw_path, "r", encoding="utf-8", errors="ignore") as f:
        rows = list(csv.DictReader(f))
        
    print(f"[INFO] Cleaning and standardizing {len(rows)} resumes across all categories...")
    
    cleaned_rows = []
    metadata_list = []
    category_counts = defaultdict(int)
    
    for row in rows:
        cat = row.get("Category", "").strip()
        raw_text = row.get("Resume", "").strip()
        
        clean_text = deep_clean_text(raw_text)
        cleaned_rows.append({"Category": cat, "Resume": clean_text})
        
        if cat not in IT_CATEGORIES:
            continue
            
        category_counts[cat] += 1
        sub_folder = IT_CATEGORIES[cat]
        cand_id = f"CAND-{sub_folder[:4].upper()}-{category_counts[cat]:03d}"
        cand_name = f"Candidate {cand_id}"
        
        # 1. Save Clean TXT
        txt_filename = f"{cand_id}.txt"
        txt_path = os.path.join(TXT_DIR, sub_folder, txt_filename)
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(f"=== CANDIDATE PROFILE: {cand_name} ===\nDomain Category: {cat}\n\n{clean_text}")
            
        # 2. Save Clean Styled PDF
        pdf_filename = f"{cand_id}.pdf"
        pdf_path = os.path.join(PDF_DIR, sub_folder, pdf_filename)
        try:
            create_pdf_resume(pdf_path, cand_name, cat, clean_text)
        except Exception:
            pass
            
        # 3. Save Clean Styled DOCX
        docx_filename = f"{cand_id}.docx"
        docx_path = os.path.join(DOCX_DIR, sub_folder, docx_filename)
        try:
            create_docx_resume(docx_path, cand_name, cat, clean_text)
        except Exception:
            pass
            
        metadata_list.append({
            "candidate_id": cand_id,
            "category": cat,
            "sub_folder": sub_folder,
            "text_file": os.path.relpath(txt_path, BASE_DIR),
            "pdf_file": os.path.relpath(pdf_path, BASE_DIR),
            "docx_file": os.path.relpath(docx_path, BASE_DIR),
            "word_count": len(clean_text.split()),
            "character_count": len(clean_text)
        })
        
    # Save cleaned master CSV
    with open(csv_clean_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Category", "Resume"])
        writer.writeheader()
        writer.writerows(cleaned_rows)
    print(f"[SUCCESS] Cleaned master CSV saved to: {csv_clean_path}")
    
    # Save master metadata index
    summary_path = os.path.join(DATASET_DIR, "dataset_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_cleaned_resumes": len(cleaned_rows),
            "total_it_resumes_generated": len(metadata_list),
            "categories_distribution": category_counts,
            "resumes": metadata_list
        }, f, indent=2, ensure_ascii=False)
        
    print("\n" + "="*55)
    print(f"[SUMMARY] 100% MOJIBAKE FIXED & RE-GENERATED:")
    print(f"  • Cleaned IT Resumes: {len(metadata_list)} files in PDF, DOCX, TXT")
    for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
        print(f"    - {cat}: {count} candidates")
    print(f"  • Clean Master CSV: {csv_clean_path}")
    print(f"  • Summary Index: {summary_path}")
    print("="*55)

if __name__ == "__main__":
    setup_directories()
    create_hr_screening_standard()
    create_sample_job_descriptions()
    clean_and_process_dataset()
