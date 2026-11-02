# TalentScreen AI: thiết kế database tinh gọn v2

Ngày thiết kế: 2026-09-22. Phạm vi: một HR/admin, đánh giá CV theo vị trí IT, xem bằng chứng, xếp hạng và so sánh.

**Quyết định thiết kế: 9 bảng nghiệp vụ, đã bao gồm audit log.** Sau khi triển khai bằng Alembic sẽ có thêm bảng kỹ thuật `alembic_version`, tức 10 bảng vật lý tổng cộng. Hai SQL view không lưu bản sao dữ liệu và không phải bảng nghiệp vụ mới.

**Trạng thái 2026-09-23:** Đã triển khai trên development và Docker release. Migration `f50b72c6d913` kết thúc cutover: runtime dùng 9 bảng và 2 view trong `compact_v2`, còn `public` chỉ có `alembic_version`. Một HR cùng rubric của các vị trí đã được chuyển. Lịch sử CV/kết quả cũ được bảo toàn trong backup riêng, không gán điểm chưa kiểm chứng vào schema mới. Xem [CUTOVER_READINESS.md](CUTOVER_READINESS.md).

## 1. Tại sao chọn 9 bảng

Người dùng cần hiểu ba khái niệm: vị trí cần tuyển, CV đã tải lên và kết quả đánh giá. Hệ thống không cần duy trì một hồ sơ nhân sự toàn cục hoặc quy trình tuyển dụng nhiều người dùng.

Vì vậy bỏ `candidates` và `applications` như các thực thể độc lập. Một source CV có metadata và định danh trích xuất cục bộ; mỗi lần đánh giá có hồ sơ bằng chứng riêng. Không tự gộp hai người theo tên/email và không lấy số đuôi tên file làm khóa.

Không gom tất cả vào một bảng JSON lớn: file gốc, rubric, đợt upload và lần xử lý có vòng đời khác nhau. Tách chúng giúp retry đúng CV, lưu lịch sử và thay đổi rubric mà không sửa điểm cũ. Đây là đánh đổi có chủ đích giữa số bảng, tính đúng đắn và khả năng bảo trì.

## 2. Chín bảng cuối cùng

| # | Bảng | Trách nhiệm | Thuộc tính chính |
|---|---|---|---|
| 1 | `users` | Một HR/admin và cài đặt cá nhân | `id`, `email`, `password_hash`, `preferences`, `token_version`, `disabled_at` |
| 2 | `job_openings` | Định danh vị trí tuyển và metadata hiển thị | `id`, `title`, `description`, `status`, `created_by_id` |
| 3 | `scoring_rubrics` | Phiên bản bất biến của toàn bộ đầu vào chấm điểm | `id`, `job_id`, `version`, `config` JSONB |
| 4 | `screening_batches` | Một đợt upload, cố định vị trí và phiên bản rubric | `id`, `job_id`, `rubric_id`, `name`, `idempotency_key`, `created_by_id` |
| 5 | `resumes` | Một file nguồn cục bộ, deduplicate theo nội dung | `id`, `sha256`, `storage_path`, `storage_status`, `mime_type`, `file_size_bytes`, định danh cục bộ |
| 6 | `batch_files` | File được nhận trong một đợt upload và quyết định của HR | `id`, `batch_id`, `resume_id`, `source_filename`, `reviewed_result_id`, `hr_decision`, `hr_note` |
| 7 | `screening_documents` | Snapshot dữ liệu đã che PII mà AI được phép đọc | `id`, `batch_file_id`, `schema_version`, `privacy_mode`, `payload`, `payload_sha256` |
| 8 | `screening_results` | Từng lần thử xử lý, hồ sơ có bằng chứng và điểm | `id`, `batch_file_id`, `document_id`, `attempt_no`, `status`, `outcome`, `grounded_profile`, `score_breakdown`, `total_score`, metadata AI |
| 9 | `audit_logs` | Nhật ký thao tác không chứa CV/PII trực tiếp | `id`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `trace_id`, `metadata`, `created_at` |

DDL đầy đủ về kiểu dữ liệu, khóa, NULL, CHECK, index và trigger nằm trong [schema.sql](schema.sql).

### Những bảng được loại bỏ bằng cách nào

- RBAC, tổ chức và nhóm: thay bằng một user có toàn quyền trong phạm vi local. `singleton` có UNIQUE + CHECK bảo đảm tối đa một dòng tài khoản, bootstrap bảo đảm có tài khoản.
- Skills, experiences, projects, education, certifications: nằm trong `screening_results.grounded_profile`, theo đúng lần đánh giá của CV.
- Job skills, tiêu chí, ngưỡng và điều kiện loại trừ: nằm trong `scoring_rubrics.config`; sửa tiêu chí tạo phiên bản mới.
- Application, shortlist, review queue: được suy ra từ file, kết quả và quyết định HR. Không lưu cùng một trạng thái ở nhiều bảng.
- Reports và dashboard: truy vấn dữ liệu nguồn; file export tùy chọn lưu cục bộ và ghi sự kiện export vào audit.
- Provider setting và secret: cấu hình backend/environment; metadata provider/model/prompt vẫn lưu theo kết quả.
- Rank và các bộ đếm: tính từ SQL view; không lưu thêm `rank`, `processed_files` hay `current_score` ở nhiều nơi.

## 3. Quan hệ và chống trỏ nhầm CV

| Quan hệ | Cardinality | Quy tắc |
|---|---|---|
| Job -> rubric | 1:N | Mỗi lần thay tiêu chí là version mới |
| Rubric -> batch | 1:N | Batch dùng đúng một rubric thuộc đúng job, kiểm soát bằng FK ghép |
| Batch -> file item | 1:N | Một item cho một source trong đợt upload |
| Resume -> file item | 1:N | File có thể được đánh giá nhiều lần hoặc cho nhiều role |
| File item -> AI document | 1:N | Snapshot mới khi đầu vào thay đổi; không ghi đè snapshot cũ |
| File item -> attempt/result | 1:N | Retry tạo dòng mới; mỗi file chỉ có một attempt queued/running |
| AI document -> result | 1:N | Retry có thể dùng lại chính snapshot đó |
| File item -> reviewed result | 0:1 | FK ghép bắt buộc quyết định HR thuộc đúng file; kết quả mới đánh dấu review cũ là stale |

Ví dụ: HR tải `Java-CV.pdf` lên. UI hiển thị tên đọc được và `Java-CV.pdf`; URL chứa UUID của **kết quả**. Danh sách, chi tiết, download và compare đều dùng cùng `resultId`, nối qua `batch_file_id` tới đúng source. Tên file chỉ là nhãn. Nếu CV chưa được chấm, UI theo `fileId` và trạng thái xử lý.

Hai file có cùng tên nhưng nội dung khác phải có hai source khác nhau. Hai lần upload cùng nội dung trong hai batch có thể dùng chung blob `resumes`, nhưng giữ hai item và hai lịch sử riêng. Trong cùng batch, trùng nội dung phải báo duplicate rõ ràng; không tạo một kết quả mới giả.

## 4. Architectural drivers và ADD

Nguồn lý thuyết: Lecture 2, slides 16-18 (quality attributes và trade-offs); Lecture 13, slide 7 (ADD dựa trên quality attribute scenarios). Driver dự án: `docs/architecture/01-drivers-add/ARCHITECTURE_DRIVERS.md`, FR-01..09, QA-01..05.

### ADD iteration 1: bảo mật và định danh

QA-01 + QA-04 dẫn đến tách `resumes` khỏi `screening_documents`. File gốc và định danh giữ cục bộ. FK ghép giữa result và document ngăn sử dụng document của CV khác. Chỉ AI adapter được đọc `payload`; không serialize ORM row hoặc join PII vào request.

### ADD iteration 2: điểm số có thể giải thích và lịch sử

QA-02 + QA-04 dẫn đến rubric/document bất biến và result theo attempt. PostgreSQL kiểm tra tổng trọng số, tổng chi tiết điểm và ngưỡng recommendation; backend vẫn phải kiểm tra bằng chứng và tính điểm. Database không thể chứng minh một câu trích từ CV là đúng chỉ bằng JSONB CHECK.

### ADD iteration 3: hiệu năng và khả năng phục hồi

QA-03 dẫn đến một document đọc theo PK, hồ sơ JSONB không phải join nhiều bảng con, partial index cho attempt đang chạy và thành công gần nhất. Không gọi AI trong transaction dài. Lease và idempotency key cho phép phát hiện job mắc kẹt sau khi backend tắt đột ngột.

### ADD iteration 4: dễ dùng và bảo trì

QA-05 dẫn đến bỏ workflow ATS và tập trung một `resultId` trên UI. Các dữ liệu lặp nằm trong JSONB có schema version; identity, quan hệ và trạng thái chính vẫn là cột có constraint. Chi phí đánh đổi: cần Pydantic validate JSON và script nâng version document khi cấu trúc thay đổi.

### Quality attribute scenarios có thể kiểm tra

| Driver | Source / Stimulus | Environment / Artifact | Response | Measure |
|---|---|---|---|---|
| QA-01 | HR tải CV có PII | Remote mode, document gửi AI | Redact ở local; chỉ gửi payload cho phép | Test payload không có tên/email/phone/filename; strict-local chặn remote; không suy diễn zero retention |
| QA-02 | Provider hoặc bug tạo tổng điểm sai | Bình thường, result | Backend tính lại; DB từ chối tổng khác breakdown hoặc tier sai | Invalid write bị từ chối; không xuất hiện kết quả ghi một phần |
| QA-04 | Một request gắn nhầm document của file B cho file A | Retry, result persistence | FK/trigger từ chối | 0 liên kết chéo trong test; chọn profile/download bằng cùng resultId |
| QA-04 | Backend dừng giữa request AI | Running attempt có lease | Sau restart, attempt hết lease được fail, tạo attempt mới | Không có hai attempt active cho một file; giữ nguyên thành công cũ |
| QA-03 | HR mở 50 kết quả của một rubric | Máy local; bộ đo 5.000 file tổng hợp | Query có phân trang; payload/profile không đưa vào list | Mục tiêu p95 API list <= 300 ms; cần benchmark riêng, chưa đo ở bộ kiểm thử DDL |
| QA-05 | HR mở CV từ results/compare | Một HR, nhiều CV tên trùng | Tên + filename rõ ràng; UUID ẩn trong route | Link integration test xác nhận cùng result/file/score |

## 5. JSONB contract và dữ liệu chưa biết

### Rubric config

`schemaVersion`, `targetRole` (snapshot mô tả role, kinh nghiệm/học vấn), `jobSkills` (canonical name/aliases/must-have), `criteria` (code/pillar/weight), `thresholds`, `disqualifiers`.

DB kiểm tra trọng số tổng 100, code không trùng, pillar thuộc năm nhóm và threshold tăng dần. Backend cần validate toàn bộ nested schema, loại trường lạ và chuẩn hóa synonym trước khi publish. Cấu hình mới bắt đầu từ draft ở UI và chỉ ghi một rubric hợp lệ khi publish.

### Grounded profile và score breakdown

`grounded_profile` giữ kỹ năng, kinh nghiệm, dự án, học vấn, chứng chỉ, matched/missing skills và evidence với phiên bản schema. Trường không xác định dùng `null`/danh sách rỗng. Không chuyển năm học thành năm kinh nghiệm hoặc địa chỉ trường thành nơi ở.

`score_breakdown` có một entry `{code, earned, max, evidence}` cho mỗi tiêu chí. Trigger đối chiếu code/max với rubric đã pin và tổng điểm với tổng earned. Đổi scoring algorithm phải tạo `scoring_version` mới. Compare chỉ cho phép cùng `job_id`, `rubric_id`, `scoring_version`; nếu khác thì yêu cầu đánh giá lại cùng cấu hình.

`status` cho biết tiến trình: queued/running/succeeded/failed/cancelled. `outcome` cho biết kết quả nghiệp vụ: scored/review_required/out_of_scope. CV ngoài IT có thể xử lý thành công nhưng `outcome=out_of_scope`, điểm NULL và không có recommendation tuyển dụng. Không biểu diễn lỗi AI hay thiếu dữ liệu bằng 0%.

### RAG và phản hồi HR

Thiết kế 9 bảng không chứng minh RAG hay huấn luyện đã hoàn tất. Với corpus nhỏ, rubric có thể giữ snapshot taxonomy và approved knowledge trong config có version; retriever local chọn mục liên quan và thêm citation/version vào `screening_documents.payload.retrievalContext`. Không trộn bằng chứng của CV khác. Nếu sau này cần tìm kiếm độc lập trên corpus lớn, đánh giá thêm một bảng knowledge riêng bằng số liệu, không ép dữ liệu vào JSON chỉ để giữ số 9.

`batch_files` giữ quyết định/note của HR gắn với một result cụ thể; audit giữ sự kiện đổi quyết định và ID. Feedback này chưa phải RLHF hay fine-tuning; tập đánh giá và quy trình cải thiện prompt vẫn phải được xây dựng riêng.

## 6. Transaction, retry và trạng thái chính xác

1. Upload: kiểm tra MIME/size và lưu file tạm, tính hash. Trong transaction ngắn, tạo/reuse source, tạo batch/file item và queued attempt. Commit sau khi file đã được rename atomically vào local storage; crash để lại orphan file được dọn bởi recovery, không coi là upload thành công.
2. Worker claim: UPDATE một queued attempt sang running, đặt lease token và hạn lease; kiểm tra affected row bằng 1. Transaction kết thúc trước khi gọi provider. Giữ mức concurrency nhỏ, ví dụ 1-2 CV, đo trước khi tăng.
3. Extraction/redaction: tạo bounded document; commit snapshot. Remote call chỉ nhận payload của snapshot vừa ghi.
4. Persist: xác nhận worker vẫn sở hữu lease bằng `WHERE status='running' AND lease_token=:token`; ghi grounded profile, breakdown, score, status, timestamp trong một transaction. Audit thành công cùng transaction.
5. Failure: fail attempt với error_code an toàn, không lưu response thô có PII. Retry khóa dòng `batch_files FOR UPDATE`, tính attempt_no tiếp theo và tạo queued attempt; partial unique index chặn chạy trùng.
6. UI: `current_file_results` trả thành công mới nhất và trạng thái attempt mới nhất riêng. Retry lỗi không làm mất thành công cũ. `batch_summary` tính total/success/failed/pending/cancelled trực tiếp; `needs_review` là tập con, không cộng lần nữa vào total.

BackgroundTasks hiện tại cần thêm bước recovery startup/định kỳ trong backend để xử lý lease quá hạn. DDL chỉ cung cấp cơ chế lưu trạng thái; nó không tự khởi chạy worker. Đổi rubric hoặc đổi role tạo batch mới để lịch sử không bị sửa.

## 7. Hiệu năng và index

- Primary-key lookup đủ cho `screening_documents.payload`; không thêm GIN cho mọi JSONB. GIN chỉ cần khi có query containment/search đã đo, và làm tăng chi phí write/storage.
- Index `(batch_file_id, attempt_no)` cùng partial index lấy result mới nhất; index batch theo role/time cho danh sách.
- List trả identity, filename, status, score; chỉ detail/compare tải JSON profile của 2-3 result yêu cầu.
- Rank dùng `row_number()` trong cùng batch/rubric/scoring version, thứ tự score giảm dần và ID ổn định khi bằng điểm. Không giữ một cột rank dễ lỗi thời.
- Payload giới hạn 256 KiB; file tối đa 10 MiB như code hiện tại. Backend cần giới hạn số file/request và độ dài từng list JSON; bộ giới hạn đó chưa được DDL thay thế.
- Giảm từ 37 xuống 9 bảng không tự làm Gemini nhanh hơn. Phải đo riêng thời gian extract, request AI, grounding, DB query và UI.

## 8. Bảo mật, retention và backup

PII nằm ở local source/identity/profile/note. Remote redaction phải được kiểm thử cả tên/dữ liệu bên trong nested text; CHECK top-level của DB không phát hiện được mọi PII trong ngôn ngữ tự nhiên. `store=false` là cờ request, không phải bằng chứng provider không lưu dữ liệu.

Application DB role trong deployment cần quyền tối thiểu; tài khoản migration/maintenance tách khỏi tài khoản runtime. `audit_logs` có trigger chặn UPDATE/DELETE thường, nhưng PostgreSQL owner/superuser có thể vô hiệu hóa trigger; không tuyên bố chống sửa bởi quản trị viên tuyệt đối. Audit chỉ giữ ID và metadata allowlist, không email/filename/CV/note. Retention audit phải là policy được chọn cho đồ án, không tự áp dụng “7 năm compliance”.

Purge file có thể đặt `storage_status=purged`, `storage_path=NULL`, xóa blob cục bộ. Đây mới là xóa file, chưa xóa PII trong kết quả. Full erasure phải xóa các dữ liệu cá nhân trong result/document/identity/note theo giao dịch maintenance đã kiểm soát; xóa result cần gỡ reviewed_result_id trước, rồi xóa result, document, batch_file, cuối cùng source không còn được tham chiếu. FK RESTRICT chống xóa nhầm. Audit không chứa nội dung ứng viên để vẫn giữ nhật ký thao tác tối thiểu.

Backup phải gồm PostgreSQL và local uploads cùng manifest hash. Chỉ chuyển hệ thống sang v2 sau một lần phục hồi thử và đối soát ID/file/result. Không xóa volume development để thử thiết kế.

## 9. Chuyển từ code hiện tại sang schema mới

Xem [MIGRATION_MAP.md](MIGRATION_MAP.md) cho toàn bộ 37 bảng lịch sử. Bảng dưới đây là kế hoạch ánh xạ ban đầu; mã runtime hiện tại dùng `backend/app/compact/` và router `/api/v1`.

| Module hiện tại | Việc phải thay |
|---|---|
| `features/auth/*` | Single user + token_version; bỏ permission/team queries; vô hiệu hóa token cũ tại cutover |
| `features/jobs/routes.py`, settings rubric/taxonomy | Đọc/ghi rubric JSON có version; không sửa rubric đang được tham chiếu |
| `features/screening/routes.py` | Upload idempotent, tạo stable file item; summary từ view |
| `features/screening/processor.py` | Thay candidate/application upsert bằng result theo file/attempt; lease; ghi result atomically |
| `features/screening/document_read_model.py` | Tạo snapshot, không upsert ghi đè theo job/resume |
| `features/candidates/routes.py` | Query theo resultId; download qua đúng file/source; compare kiểm tra rubric/scoring version |
| Review/shortlist/report compatibility | Adapter sang quyết định trên file, result và view; endpoint không hỗ trợ phải trả lỗi rõ ràng, không giữ code truy vấn bảng đã bỏ |
| Frontend results/profile/compare | Truyền resultId và sourceFilename xuyên suốt; không ánh xạ theo tên hoặc index |
| Swagger/tests | Cập nhật response/request, test kết nối FE-BE và trường hợp lỗi |

Cutover đã thực hiện với backup/restore thử, kiểm thử API tổng hợp, dừng backend cũ và migration có cờ xác nhận. Không có manifest ID cho kết quả CV cũ vì dữ liệu bằng chứng không đủ để ánh xạ tin cậy; phần lịch sử đó chỉ còn trong backup.

## 10. Kiểm chứng đã thực hiện

Chạy từ `backend/`:

```powershell
.\.venv311\Scripts\python.exe -m scripts.verify_compact_schema --report ..\docs\database\compact-v2\verification.json
```

Script tạo schema tên ngẫu nhiên trong transaction PostgreSQL, dựng đúng 9 bảng và 2 view, dùng dữ liệu tổng hợp, kiểm tra 30 tình huống integrity/retry/score/privacy-mode, rồi rollback cả schema. Xem [verification.json](verification.json). Không gọi AI, không đọc CV thật, không sửa bảng public.

Để kiểm tra DB runtime, chạy `python -m scripts.verify_live_compact`. API synthetic regression chạy bằng `python -m scripts.verify_compact_api` (16 kịch bản, AI giả lập). Chưa đo tải hoặc chứng minh độ chính xác của AI thật trên PDF scan; không được tuyên bố hệ thống chính xác 100%.
