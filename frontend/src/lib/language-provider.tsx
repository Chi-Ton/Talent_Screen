"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type Language = "vi";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (value: string) => string;
};

const LANGUAGE_KEY = "talentscreen.language";

const translations: Record<string, string> = {
  "Overview": "Tổng quan",
  "Upload & Evaluate": "Tải lên & Đánh giá",
  "Results": "Kết quả",
  "Compare": "So sánh",
  "Private HR Workspace": "Không gian HR riêng tư",
  "Open navigation": "Mở điều hướng",
  "Close navigation": "Đóng điều hướng",
  "CV Screening / Upload & Evaluate": "Lọc CV / Tải lên & Đánh giá",
  "CV Screening / Results": "Lọc CV / Kết quả",
  "CV Screening / Compare": "Lọc CV / So sánh",
  "CV Screening / Candidate Profile": "Lọc CV / Hồ sơ ứng viên",
  "CV Screening / Match Analysis": "Lọc CV / Phân tích phù hợp",
  "Privacy protection is mandatory: direct identity and contact data are removed locally before remote AI analysis.": "Bảo vệ riêng tư là bắt buộc: danh tính và thông tin liên hệ được loại bỏ cục bộ trước khi AI từ xa phân tích.",
  "Evaluate CVs for:": "Đánh giá CV cho:",
  "Select a target role": "Chọn vị trí tuyển dụng",
  "Select target role": "Chọn vị trí tuyển dụng",
  "Select target role...": "Chọn vị trí tuyển dụng...",
  "Scores use the selected role criteria": "Điểm dùng tiêu chí của vị trí đã chọn",
  "Accepted: PDF, DOCX, TXT": "Chấp nhận: PDF, DOCX, TXT",
  "PII-redacted AI request": "Yêu cầu AI đã ẩn dữ liệu cá nhân",
  "Manage role criteria": "Quản lý tiêu chí vị trí",
  "Drag and drop resumes here": "Kéo thả CV vào đây",
  "Select CVs from this computer. The system extracts evidence, evaluates every CV with the same rubric, then ranks the results.": "Chọn CV từ máy này. Hệ thống trích xuất bằng chứng, đánh giá mọi CV bằng cùng rubric rồi xếp hạng kết quả.",
  "Browse files": "Chọn tệp",
  "Select folder": "Chọn thư mục",
  "Evaluation Setup": "Thiết lập đánh giá",
  "Target Role": "Vị trí tuyển dụng",
  "Evaluation Name": "Tên lần đánh giá",
  "CV evaluation": "Đánh giá CV",
  "Private screening enforced": "Bắt buộc lọc CV riêng tư",
  "Names and contact details stay local; AI receives only redacted evidence.": "Tên và thông tin liên hệ ở lại máy; AI chỉ nhận bằng chứng đã ẩn danh.",
  "Always on": "Luôn bật",
  "Upload Queue": "Danh sách CV chờ tải",
  "No files in the upload queue.": "Chưa có CV trong danh sách chờ.",
  "Evaluate CVs": "Đánh giá CV",
  "Evaluation Results": "Kết quả đánh giá",
  "Ranked only against:": "Chỉ xếp hạng theo:",
  "Search candidates": "Tìm ứng viên",
  "Search candidates...": "Tìm ứng viên...",
  "Minimum score": "Điểm tối thiểu",
  "Recommendation tier": "Mức đề xuất",
  "Must-have skill": "Kỹ năng bắt buộc",
  "Experience": "Kinh nghiệm",
  "Candidate status": "Trạng thái ứng viên",
  "Sort candidates": "Sắp xếp ứng viên",
  "Sort by: Score (High to Low)": "Sắp xếp: Điểm cao đến thấp",
  "Sort by: Score (Low to High)": "Sắp xếp: Điểm thấp đến cao",
  "Sort by: Experience": "Sắp xếp: Kinh nghiệm",
  "Active filters:": "Bộ lọc đang dùng:",
  "Clear all": "Xóa bộ lọc",
  "Candidate Comparison": "So sánh ứng viên",
  "Selected candidates": "Các ứng viên đã chọn",
  "Back to results": "Quay lại kết quả",
  "Export comparison": "Xuất bảng so sánh",
  "Add candidate to compare": "Thêm ứng viên để so sánh",
  "Search name or CV file...": "Tìm tên hoặc tệp CV...",
  "Overall Score": "Tổng điểm",
  "Weighted rubric result": "Kết quả rubric có trọng số",
  "Recommendation": "Đề xuất",
  "Technical Skills": "Kỹ năng kỹ thuật",
  "Projects & Impact": "Dự án & Tác động",
  "Systems & Cloud": "Hệ thống & Cloud",
  "Education & Certifications": "Học vấn & Chứng chỉ",
  "Relevant Experience": "Kinh nghiệm liên quan",
  "Normalized Skills": "Kỹ năng đã chuẩn hóa",
  "Key Strengths": "Điểm mạnh chính",
  "Gaps to Review": "Điểm thiếu cần xem",
  "Source CV:": "CV nguồn:",
  "Evaluated for": "Được đánh giá cho",
  "Not selected": "Không chọn",
  "Add to shortlist": "Đưa vào danh sách phù hợp",
  "Match Analysis": "Phân tích phù hợp",
  "Resume & Parsed Profile": "CV & Hồ sơ đã trích xuất",
  "Raw text not retained": "Không lưu văn bản CV thô",
  "Privacy-Protected Processing": "Xử lý bảo vệ riêng tư",
  "Text extraction completed successfully. The raw CV text was deleted after structured analysis; only grounded profile fields and scoring evidence were retained.": "Trích xuất văn bản đã hoàn tất. Nội dung CV thô được xóa sau khi phân tích có cấu trúc; chỉ giữ trường hồ sơ và bằng chứng chấm điểm đã đối chiếu.",
  "Source filename retained locally; raw text retention is disabled": "Tên tệp nguồn được giữ cục bộ; không lưu văn bản CV thô",
  "GROUNDED EXTRACTION": "TRÍCH XUẤT CÓ ĐỐI CHIẾU",
  "Structured Data": "Dữ liệu có cấu trúc",
  "Personal Information": "Thông tin cá nhân",
  "Work History": "Kinh nghiệm làm việc",
  "Projects": "Dự án",
  "AI Suitability Summary": "Tóm tắt mức độ phù hợp từ AI",
  "Key Gaps": "Điểm còn thiếu",
  "Five-Pillar Score Breakdown": "Chi tiết điểm theo năm trụ cột",
  "Evidence Mapping": "Đối chiếu bằng chứng",
  "Open parsed profile": "Mở hồ sơ đã trích xuất",
  "HR Decision": "Quyết định của HR",
  "Current decision": "Quyết định hiện tại",
  "Keep for review": "Giữ lại để xem xét",
  "Shortlist": "Phù hợp",
  "Screening Provenance": "Nguồn gốc lần phân tích",
  "Provider / Model": "Provider / Model",
  "Privacy": "Riêng tư",
  "Source": "Nguồn",
  "Job Openings": "Tin tuyển dụng",
  "Candidates": "Ứng viên",
  "Screening Batches": "Lô sàng lọc CV",
  "Review Queue": "Hàng chờ duyệt",
  "Shortlists": "Danh sách rút gọn",
  "Reports": "Báo cáo",
  "Users & Roles": "Người dùng & Vai trò",
  "Audit Logs": "Nhật ký hệ thống",
  "Settings": "Cài đặt",
  "Enterprise HR": "Nhân sự doanh nghiệp",
  "Global search": "Tìm kiếm toàn hệ thống",
  "Search...": "Tìm kiếm...",
  "Notifications": "Thông báo",
  "Help": "Trợ giúp",
  "User menu": "Menu người dùng",
  "VI / ENG": "VI / ENG",
  "Switch to Vietnamese": "Chuyển sang tiếng Việt",
  "Switch to English": "Chuyển sang tiếng Anh",
  "Administration": "Quản trị",
  "Administration / Settings / AI & Taxonomy": "Quản trị / Cài đặt / AI & Phân loại",
  "Insights / Reports": "Phân tích / Báo cáo",
  "AI and Skill Taxonomy Settings": "Cài đặt AI và phân loại kỹ năng",
  "AI & Taxonomy": "AI & Phân loại",
  "Screening rubric": "Rubric sàng lọc",
  "AI & taxonomy": "AI & phân loại",
  "Account & security": "Tài khoản & bảo mật",
  "AI Processing": "Xử lý AI",
  "Synonyms": "Từ đồng nghĩa",
  "Password recovery mode": "Chế độ khôi phục mật khẩu",
  "Forgot Password": "Quên mật khẩu",
  "Reset Password": "Đặt lại mật khẩu",
  "Reset your password": "Đặt lại mật khẩu",
  "Enter your work email address and we'll send you a link to reset your password.": "Nhập email công việc để nhận liên kết đặt lại mật khẩu.",
  "Send reset link": "Gửi liên kết đặt lại",
  "Back to sign in": "Quay lại đăng nhập",
  "Create new password": "Tạo mật khẩu mới",
  "Your new password must meet the security requirements below.": "Mật khẩu mới phải đáp ứng các yêu cầu bảo mật dưới đây.",
  "Password must contain:": "Mật khẩu phải có:",
  "At least 8 characters": "Ít nhất 8 ký tự",
  "One uppercase letter": "Một chữ cái viết hoa",
  "One number": "Một chữ số",
  "One special character (!@#$%^&*)": "Một ký tự đặc biệt (!@#$%^&*)",
  "New Password": "Mật khẩu mới",
  "Confirm Password": "Xác nhận mật khẩu",
  "Password reset": "Đã đặt lại mật khẩu",
  "Reset password": "Đặt lại mật khẩu",
  "Please enter a valid work email address.": "Vui lòng nhập email công việc hợp lệ.",
  "Password must be at least 8 characters.": "Mật khẩu phải có ít nhất 8 ký tự.",
  "Passwords do not match.": "Mật khẩu không khớp.",
  "Enterprise-Grade HR Intelligence": "Nền tảng nhân sự cấp doanh nghiệp",
  "Full transparency in AI screening processes.": "Minh bạch đầy đủ trong quy trình sàng lọc bằng AI.",
  "SOC2 Type II certified data handling.": "Xử lý dữ liệu đạt chứng nhận SOC2 Type II.",
  "Granular permissions for enterprise compliance.": "Quyền truy cập chi tiết phục vụ tuân thủ doanh nghiệp.",
  "Dismiss provider warning": "Đóng cảnh báo provider",
  "Provider configuration required:": "Cần cấu hình provider:",
  "AI processing is unavailable until a server-side provider is configured.": "Không thể xử lý AI cho đến khi cấu hình provider phía máy chủ.",
  "Core Processing Engine": "Bộ máy xử lý cốt lõi",
  "Manage primary AI provider connections and parameters.": "Quản lý kết nối và tham số của provider AI chính.",
  "Model Version": "Phiên bản model",
  "Rotate Key": "Đổi key",
  "Confidence Threshold": "Ngưỡng độ tin cậy",
  "Minimum confidence required before accepting extracted data.": "Độ tin cậy tối thiểu trước khi chấp nhận dữ liệu trích xuất.",
  "Summary Word Limit": "Giới hạn từ tóm tắt",
  "Resiliency & Limits": "Khả năng phục hồi & giới hạn",
  "Request Timeout": "Thời gian chờ request",
  "Retry Count": "Số lần thử lại",
  "Cache Status": "Trạng thái cache",
  "Unavailable": "Không khả dụng",
  "Last Health Check": "Kiểm tra hệ thống gần nhất",
  "Not available": "Chưa có",
  "View Audit Trail": "Xem nhật ký kiểm toán",
  "Taxonomy import is ready for CSV mapping.": "Nhập taxonomy sẵn sàng để ánh xạ CSV.",
  "Import taxonomy": "Nhập taxonomy",
  "Search skills or categories...": "Tìm kỹ năng hoặc danh mục...",
  "Normalize extracted skills into consistent categories used by the scoring engine.": "Chuẩn hóa kỹ năng trích xuất thành các danh mục dùng bởi bộ máy chấm điểm.",
  "Automatic mappings are applied only when confidence is 90% or higher.": "Ánh xạ tự động chỉ áp dụng khi độ tin cậy từ 90% trở lên.",
  "The AI provider is not configured on this server yet.": "Provider AI chưa được cấu hình trên máy chủ.",
  "AI provider settings cannot be saved until server configuration is enabled.": "Chưa thể lưu cài đặt provider AI cho đến khi bật cấu hình phía máy chủ.",
  "Key rotation requires a server-side secret manager.": "Đổi key cần secret manager phía máy chủ.",
  "AI settings reset to the saved configuration.": "Đã đặt lại cài đặt AI về cấu hình đã lưu.",
  "Recruitment / Create Job / Basic Information": "Tuyển dụng / Tạo tin / Thông tin cơ bản",
  "Recruitment / Create Job / Screening Criteria": "Tuyển dụng / Tạo tin / Tiêu chí sàng lọc",
  "Recruitment / Create Job / Scoring Weights": "Tuyển dụng / Tạo tin / Trọng số chấm điểm",
  "Recruitment / Create Job / Review": "Tuyển dụng / Tạo tin / Xem lại",
  "Sign In": "Đăng nhập",
  "Access your enterprise dashboard": "Truy cập bảng điều khiển doanh nghiệp",
  "Access your private CV screening workspace": "Truy cập công cụ lọc CV riêng tư",
  "Work Email": "Email công việc",
  "Password": "Mật khẩu",
  "Forgot password?": "Quên mật khẩu?",
  "Remember me for 30 days": "Ghi nhớ tôi trong 30 ngày",
  "Sign in": "Đăng nhập",
  "Signing in...": "Đang đăng nhập...",
  "Secure Processing": "Xử lý an toàn",
  "Role-based Access": "Phân quyền theo vai trò",
  "Auditable Decisions": "Quyết định có thể kiểm toán",
  "Single HR Access": "Truy cập dành cho một HR",
  "Evidence-grounded Scores": "Điểm dựa trên bằng chứng CV",
  "Protected by enterprise-grade encryption. Intended for authorized personnel only.": "Được bảo vệ bằng mã hóa cấp doanh nghiệp. Chỉ dành cho người dùng được cấp quyền.",
  "Candidate data is local and intended only for the authorized HR operator.": "Dữ liệu ứng viên được lưu cục bộ và chỉ dành cho HR được cấp quyền.",
  "Create job opening": "Tạo tin tuyển dụng",
  "Create Job": "Tạo tin tuyển dụng",
  "Basic information": "Thông tin cơ bản",
  "Screening criteria": "Tiêu chí sàng lọc",
  "Scoring weights": "Trọng số chấm điểm",
  "Review & publish": "Xem lại & đăng tin",
  "Job Details": "Chi tiết công việc",
  "Job title": "Tên vị trí",
  "Department": "Phòng ban",
  "Employment type": "Hình thức làm việc",
  "Seniority level": "Cấp bậc",
  "Work arrangement": "Mô hình làm việc",
  "Location": "Địa điểm",
  "Hiring manager": "Quản lý tuyển dụng",
  "Number of openings": "Số lượng cần tuyển",
  "Job Description": "Mô tả công việc",
  "Description": "Mô tả",
  "Import JD file": "Nhập file JD",
  "Save draft": "Lưu bản nháp",
  "Cancel": "Hủy",
  "Continue to criteria": "Tiếp tục đến tiêu chí",
  "Continue to scoring": "Tiếp tục đến chấm điểm",
  "Continue to review": "Tiếp tục xem lại",
  "Back": "Quay lại",
  "Criteria Restriction Warning": "Cảnh báo giới hạn tiêu chí",
  "Auto-generate criteria from Job Description": "Tự động tạo tiêu chí từ mô tả công việc",
  "Extract Rules": "Trích xuất quy tắc",
  "Rules extracted": "Đã trích xuất quy tắc",
  "Must-have technical skills": "Kỹ năng kỹ thuật bắt buộc",
  "Nice-to-have skills": "Kỹ năng cộng điểm",
  "Total Experience": "Tổng kinh nghiệm",
  "Education Requirements": "Yêu cầu học vấn",
  "Minimum Years": "Số năm tối thiểu",
  "Strict Enforce": "Bắt buộc nghiêm ngặt",
  "Minimum Degree Level": "Bậc bằng tối thiểu",
  "Accepted Fields of Study": "Chuyên ngành chấp nhận",
  "Add skill": "Thêm kỹ năng",
  "Setup Progress": "Tiến độ thiết lập",
  "Draft Summary": "Tóm tắt bản nháp",
  "Rules Defined": "Quy tắc đã định nghĩa",
  "Scoring Weights": "Trọng số chấm điểm",
  "Evaluation Pillars": "Các trụ cột đánh giá",
  "Recommendation Thresholds": "Ngưỡng đề xuất",
  "Minimum Disqualifiers": "Điều kiện loại tối thiểu",
  "Score Preview": "Xem trước điểm",
  "Valid rubric total": "Tổng rubric hợp lệ",
  "Ready to Publish": "Sẵn sàng đăng tin",
  "Review & Publish": "Xem lại & Đăng tin",
  "Basic Information": "Thông tin cơ bản",
  "Scoring & Criteria": "Tiêu chí & Chấm điểm",
  "Readiness Checklist": "Danh sách kiểm tra sẵn sàng",
  "Basic info complete": "Đã đủ thông tin cơ bản",
  "Criteria defined": "Đã định nghĩa tiêu chí",
  "Weights total 100%": "Tổng trọng số là 100%",
  "Publish Job": "Đăng tin tuyển dụng",
  "Confirm and Publish": "Xác nhận và đăng tin",
  "Job Published Successfully": "Đăng tin thành công",
  "Upload CVs now": "Tải CV lên ngay",
  "Return to list": "Quay lại danh sách",
  "Active": "Đang hoạt động",
  "Draft": "Bản nháp",
  "Completed": "Đã hoàn tất",
  "Processing": "Đang xử lý",
  "Queued": "Đang chờ",
  "Failed": "Thất bại",
  "Strong Recommend": "Rất phù hợp",
  "Recommend": "Phù hợp",
  "Review Needed": "Cần xem xét",
  "Reject": "Từ chối",
  "Not configured": "Chưa cấu hình",
  "Not provided": "Chưa cung cấp",
  "Loading...": "Đang tải...",
  "Loading users...": "Đang tải người dùng...",
  "Loading audit logs...": "Đang tải nhật ký...",
  "Provider Status": "Trạng thái provider",
  "API Key": "API key",
  "Test Configuration": "Kiểm tra cấu hình",
  "Save changes": "Lưu thay đổi",
  "Reset": "Đặt lại",
  "Skill Taxonomy": "Phân loại kỹ năng",
  "Synonym Mapping": "Ánh xạ từ đồng nghĩa",
  "Data Privacy": "Quyền riêng tư dữ liệu",
  "Server-managed secret": "Secret do máy chủ quản lý",
  "Download original CV": "Tải CV gốc",
  "Original CV stored locally": "CV gốc được lưu cục bộ",
  "Original CV download started.": "Đã bắt đầu tải CV gốc.",
  "Original file remains local; raw extracted text is not retained": "Tệp gốc được lưu cục bộ; không lưu nội dung CV thô đã trích xuất",
  "Locally parsed document": "Tài liệu được phân tích cục bộ",
  "AI, Scoring and Privacy": "AI, chấm điểm và riêng tư",
  "This page reports the active backend configuration. Secrets and model selection are changed only in backend/.env.": "Trang này hiển thị cấu hình backend đang hoạt động. Secret và model chỉ được thay đổi trong backend/.env.",
  "Testing...": "Đang kiểm tra...",
  "Configuration Source": "Nguồn cấu hình",
  "Scoring Owner": "Bộ phận chấm điểm",
  "Deterministic backend rules": "Quy tắc xác định ở backend",
  "Raw CV text storage": "Lưu nội dung CV thô",
  "Disabled": "Đã tắt",
  "Enabled": "Đã bật",
  "Configuration Status": "Trạng thái cấu hình",
  "Server configured": "Máy chủ đã cấu hình",
  "Ready for evidence-grounded screening": "Sẵn sàng lọc CV dựa trên bằng chứng",
  "Restart the backend after changing backend/.env.": "Khởi động lại backend sau khi thay đổi backend/.env.",
  "Settings / AI & Privacy": "Cài đặt / AI & Quyền riêng tư",
  "These controls are enforced by the backend and cannot be weakened in the browser.": "Các kiểm soát này do backend thực thi và không thể bị giảm mức bảo vệ trên trình duyệt.",
  "Local-first policy": "Chính sách ưu tiên cục bộ",
  "PII redaction before AI": "Ẩn dữ liệu cá nhân trước AI",
  "Names, contact details, direct identifiers and street addresses are removed locally before a remote request.": "Tên, thông tin liên hệ, định danh trực tiếp và địa chỉ đường phố được loại bỏ cục bộ trước khi gửi yêu cầu từ xa.",
  "Store extracted CV text in PostgreSQL": "Lưu nội dung CV đã trích xuất trong PostgreSQL",
  "Disabled by default. The original CV remains in protected local storage for evidence review.": "Mặc định đã tắt. CV gốc vẫn nằm trong vùng lưu trữ cục bộ được bảo vệ để HR kiểm tra bằng chứng.",
  "Verified zero data retention": "Đã xác minh không lưu dữ liệu",
  "9Router and its upstream provider are outside this application's storage boundary; use an approved Gemini ZDR project or a local model for a zero-retention guarantee.": "9Router và provider phía sau nằm ngoài phạm vi lưu trữ của ứng dụng; cần dự án Gemini ZDR được phê duyệt hoặc model cục bộ để bảo đảm không lưu dữ liệu.",
  "Current mode:": "Chế độ hiện tại:",
  "Only locally redacted professional evidence is sent for remote processing.": "Chỉ bằng chứng nghề nghiệp đã được ẩn danh cục bộ mới được gửi đi xử lý từ xa.",
  "AI processing stays on this machine.": "Xử lý AI được giữ trên máy này.",
  "View audit log": "Xem nhật ký kiểm toán",
  "Local CV Retention": "Thời hạn lưu CV cục bộ",
  "Delete expired source files from protected local storage while preserving grounded results and audit history.": "Xóa tệp CV nguồn đã quá hạn khỏi vùng lưu trữ cục bộ được bảo vệ, đồng thời giữ lại kết quả có bằng chứng và lịch sử kiểm toán.",
  "Available local files": "Tệp cục bộ hiện có",
  "Eligible for deletion": "Đủ điều kiện xóa",
  "Eligible storage": "Dung lượng có thể xóa",
  "Manual confirmation required": "Cần xác nhận thủ công",
  "Only files inside this project's uploads folder and older than the retention cutoff can be deleted.": "Chỉ tệp trong thư mục uploads của dự án và cũ hơn thời hạn lưu mới có thể bị xóa.",
  "Delete expired files": "Xóa tệp quá hạn",
  "Deleting...": "Đang xóa...",
  "Deleting expired local CV files...": "Đang xóa các tệp CV cục bộ quá hạn...",
  "Expired local CV files could not be deleted.": "Không thể xóa các tệp CV cục bộ quá hạn.",
  "Delete expired local CV files now? Candidate profiles, scores and audit records will be preserved.": "Xóa các tệp CV cục bộ quá hạn ngay bây giờ? Hồ sơ ứng viên, điểm số và nhật ký kiểm toán vẫn được giữ lại.",
  "expired local CV file(s) deleted. Screening results were preserved.": "tệp CV cục bộ quá hạn đã được xóa. Kết quả sàng lọc vẫn được giữ lại.",
  "days": "ngày",
  "Protected": "Được bảo vệ",
  "Not verified": "Chưa xác minh",
  "Retry failed CVs": "Thử lại các CV lỗi",
  "AI provider is not configured on the server yet.": "Provider AI chưa được cấu hình trên máy chủ.",
  "Return to the incomplete setup step before publishing this job.": "Quay lại bước chưa hoàn tất trước khi đăng tin."
};

function translateValue(value: string, _language: Language = "vi") {
  const trimmed = value.trim();
  const translated = translations[trimmed];
  if (!translated) return value;
  return value.replace(trimmed, translated);
}

function shouldSkipTextNode(node: Text) {
  const parent = node.parentElement;
  return !parent || Boolean(parent.closest("[data-no-translate], script, style"));
}

function translateDom(language: Language, originalTexts: WeakMap<Text, string>, originalAttributes: WeakMap<Element, Map<string, string>>) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (!shouldSkipTextNode(node)) {
      const knownOriginal = originalTexts.get(node);
      const original = knownOriginal !== undefined ? knownOriginal : node.data;
      if (knownOriginal === undefined) originalTexts.set(node, original);
      const knownVietnamese = knownOriginal === undefined ? undefined : translateValue(knownOriginal, "vi");
      if (knownOriginal !== undefined && node.data !== knownOriginal && node.data !== knownVietnamese) {
        originalTexts.set(node, node.data);
      }
      const source = originalTexts.get(node) ?? original;
      const nextValue = language === "vi" ? translateValue(source, language) : source;
      if (node.data !== nextValue) node.data = nextValue;
    }
    node = walker.nextNode() as Text | null;
  }

  const elements = document.body.querySelectorAll<HTMLElement>("input, textarea, button, [title], [aria-label]");
  for (const element of elements) {
    if (element.closest("[data-no-translate]")) continue;
    const attributes = originalAttributes.get(element) ?? new Map<string, string>();
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      const knownOriginal = attributes.get(attribute);
      const original = knownOriginal !== undefined ? knownOriginal : current;
      const knownVietnamese = knownOriginal === undefined ? undefined : translateValue(knownOriginal, "vi");
      if (knownOriginal !== undefined && current !== knownOriginal && current !== knownVietnamese) {
        attributes.set(attribute, current);
      } else {
        attributes.set(attribute, original);
      }
      const source = attributes.get(attribute) ?? original;
      element.setAttribute(attribute, language === "vi" ? translateValue(source, language) : source);
    }
    originalAttributes.set(element, attributes);
  }
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language: Language = "vi";
  const originalTexts = useRef(new WeakMap<Text, string>());
  const originalAttributes = useRef(new WeakMap<Element, Map<string, string>>());

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_KEY, "vi");
  }, []);

  useEffect(() => {
    document.documentElement.lang = "vi";
    translateDom("vi", originalTexts.current, originalAttributes.current);
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        translateDom("vi", originalTexts.current, originalAttributes.current);
      });
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title"],
      characterData: true,
      childList: true,
      subtree: true
    });
    return () => observer.disconnect();
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language: "vi",
    setLanguage: () => {},
    t: (valueToTranslate) => translateValue(valueToTranslate, "vi")
  }), []);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
